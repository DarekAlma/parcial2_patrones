"""Scraper de Google Flights (vuelos ida y vuelta, precios en COP).

Google Flights entrega los resultados ya renderizados en el HTML. Cada vuelo
trae un `aria-label` de accesibilidad con TODA la información en lenguaje
natural; es mucho más estable que las clases CSS ofuscadas, así que se parsea
con expresiones regulares.

Ejemplo real de aria-label:
    A partir de 865300 pesos colombianos (precio total de ida y vuelta). Vuelo
    directo de JetSMART. Operado por Jetsmart Airlines S.a.s.. Sale de
    Aeropuerto Internacional El Dorado el viernes, octubre 30 a las 18:20. Llega
    a Aeropuerto Internacional Gustavo Rojas Pinilla - San Andrés el viernes,
    octubre 30 a las 20:44. Duración total: 2 h 24 min.
"""
from __future__ import annotations

import re
from urllib.parse import quote

from bs4 import BeautifulSoup

from wandersync.config import TripWindow
from wandersync.scrapers.base import ScrapeEmptyError, fetch_html, parse_duration_minutes

SOURCE = "google_flights"
BASE_URL = "https://www.google.com/travel/flights"

_PRICE = re.compile(r"A partir de ([\d.,]+) pesos colombianos")
_STOPS = re.compile(r"Vuelo con (\d+) escalas?")
_AIRLINE = re.compile(r"(?:Vuelo directo|Vuelo con \d+ escalas?) de (.+?)\.(?:\s|$)")
_OPERATED = re.compile(r"Operado por (.+?)\. Sale de")
_DEPART = re.compile(r"Sale de (.+?) el [^.]+? a las (\d{1,2}:\d{2})")
_ARRIVE = re.compile(r"Llega a (.+?) el [^.]+? a las (\d{1,2}:\d{2})")
_DURATION = re.compile(r"Duración total: ([^.]+)\.")


def build_url(window: TripWindow) -> str:
    query = (
        f"Flights to {window.destination} from {window.origin} "
        f"on {window.check_in.isoformat()} through {window.check_out.isoformat()}"
    )
    return f"{BASE_URL}?q={quote(query)}&hl=es&gl=co&curr=COP"


def parse_label(label: str) -> dict | None:
    price = _PRICE.search(label)
    airline = _AIRLINE.search(label)
    if not price or not airline:
        return None
    stops = _STOPS.search(label)
    operated = _OPERATED.search(label)
    depart = _DEPART.search(label)
    arrive = _ARRIVE.search(label)
    duration = _DURATION.search(label)
    return {
        "price_cop": int(re.sub(r"\D", "", price.group(1))),
        "airline": airline.group(1).strip(),
        "operated_by": operated.group(1).strip() if operated else None,
        "stops": int(stops.group(1)) if stops else 0,
        "origin_airport": depart.group(1).strip() if depart else None,
        "depart_time": depart.group(2) if depart else None,
        "destination_airport": arrive.group(1).strip() if arrive else None,
        "arrive_time": arrive.group(2) if arrive else None,
        "duration_minutes": parse_duration_minutes(duration.group(1)) if duration else None,
    }


def parse_html(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    results = []
    for element in soup.find_all(attrs={"aria-label": _PRICE}):
        parsed = parse_label(element["aria-label"])
        if parsed:
            results.append(parsed)
    return results


def scrape(window: TripWindow) -> list[dict]:
    html = fetch_html(build_url(window), SOURCE)
    rows = parse_html(html)
    if not rows:
        raise ScrapeEmptyError(f"{SOURCE}: 0 vuelos para {window.search_key} (¿bloqueo o cambio de HTML?)")
    return rows
