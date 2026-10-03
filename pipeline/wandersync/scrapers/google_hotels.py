"""Scraper de Google Hotels (precio por noche y total de la estadía en COP).

Google Hotels acepta las fechas en lenguaje natural dentro de la consulta
("hoteles en Medellín del 15 de noviembre al 18 de noviembre de 2026") y
devuelve las tarjetas renderizadas en el servidor.

Estructura de cada tarjeta (texto separado por " | "):
    MOVA Hotel Boutique | EXCELENTE OFERTA | COP 129,579 | COP 388,736 en total |
    3 noches con impuestos y tasas | ... | 35% menos de lo habitual | 4.6 | (38) | ...
"""
from __future__ import annotations

import re
from urllib.parse import quote

from bs4 import BeautifulSoup

from wandersync.config import TripWindow
from wandersync.scrapers.base import ScrapeEmptyError, fetch_html, parse_decimal, parse_money

SOURCE = "google_hotels"
BASE_URL = "https://www.google.com/travel/search"

MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

# Selector de la tarjeta de hotel (clase estable desde 2024) + fallback genérico.
CARD_SELECTORS = ["div.uaTTDe", "c-wiz[data-node-index] div[jsname='mutHjb']"]

_PRICE = re.compile(r"(?:COP|\$)\s?([\d.,]+)")
_TOTAL = re.compile(r"(?:COP|\$)\s?([\d.,]+) en total")
_NIGHTS = re.compile(r"(\d+) noches?")
_RATING = re.compile(r"\|\s(\d[.,]\d)\s\|\s\(([\d.,]+)\)")
_STARS = re.compile(r"(\d) estrellas")
_DISCOUNT = re.compile(r"(\d+)\s?% menos de lo habitual")
_AMENITIES = re.compile(r"Servicios que ofrece [^:]+: ([^|]+)")


def build_query(window: TripWindow) -> str:
    ci, co = window.check_in, window.check_out
    return (
        f"hoteles en {window.city_name} del {ci.day} de {MONTHS[ci.month - 1]} "
        f"al {co.day} de {MONTHS[co.month - 1]} de {co.year}"
    )


def build_url(window: TripWindow) -> str:
    return f"{BASE_URL}?q={quote(build_query(window))}&hl=es-419&gl=co&curr=COP"


def parse_card(card, nights_expected: int) -> dict | None:
    name_el = card.select_one("h2")
    # Google a veces renderiza tarjetas con un título de relleno ("—").
    if not name_el or not re.search(r"[^\W\d_]", name_el.get_text()):
        return None
    text = card.get_text(" | ", strip=True)
    price = _PRICE.search(text)
    if not price:
        return None

    per_night = parse_money(price.group(1))
    total_match = _TOTAL.search(text)
    nights_match = _NIGHTS.search(text)
    nights = int(nights_match.group(1)) if nights_match else nights_expected
    total = parse_money(total_match.group(1)) if total_match else (per_night or 0) * nights

    rating = _RATING.search(text)
    labels = " ".join(el.get("aria-label", "") for el in card.find_all(attrs={"aria-label": True}))
    stars = _STARS.search(f"{text} {labels}")
    discount = _DISCOUNT.search(text)
    amenities = _AMENITIES.search(text)
    image = card.find("img")
    link = card.find("a", href=True)

    return {
        "name": name_el.get_text(strip=True),
        "price_per_night_cop": per_night,
        "total_price_cop": total,
        "nights": nights,
        "rating": parse_decimal(rating.group(1)) if rating else None,
        "reviews": parse_money(rating.group(2)) if rating else None,
        "stars": int(stars.group(1)) if stars else None,
        "deal": f"{discount.group(1)}% menos de lo habitual" if discount else None,
        "amenities": amenities.group(1).strip()[:300] if amenities else None,
        "image_url": (image.get("src") or image.get("data-src")) if image else None,
        "detail_url": f"https://www.google.com{link['href']}" if link and link["href"].startswith("/") else None,
    }


def parse_html(html: str, nights_expected: int) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    cards = []
    for selector in CARD_SELECTORS:
        cards = soup.select(selector)
        if cards:
            break
    results = []
    for card in cards:
        parsed = parse_card(card, nights_expected)
        if parsed:
            results.append(parsed)
    return results


def scrape(window: TripWindow) -> list[dict]:
    html = fetch_html(build_url(window), SOURCE)
    rows = parse_html(html, window.nights)
    if not rows:
        raise ScrapeEmptyError(f"{SOURCE}: 0 hoteles para {window.search_key} (¿bloqueo o cambio de HTML?)")
    return rows
