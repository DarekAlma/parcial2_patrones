"""Scraper de Kayak Colombia (alquiler de autos en el aeropuerto de destino).

A diferencia de Google, Kayak arma los resultados con JavaScript (hace polling
a su API interna), así que se usa Selenium con Chrome headless — la misma
técnica de la plantilla original del curso (exito.com).

Las clases CSS de Kayak están ofuscadas (`QYm5-title`, `EuxN-price`...), por eso
el parser se apoya en lo que es semánticamente estable:
  * `div.js-result[data-result-id]`  -> tarjeta de resultado
  * `.js-title`                       -> modelo del auto
  * `aria-label` de accesibilidad     -> pasajeros, maletas, puertas, precio...
"""
from __future__ import annotations

import logging
import os
import re
import time

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from wandersync.config import USER_AGENT, TripWindow
from wandersync.scrapers.base import (
    ScrapeEmptyError,
    ScrapeError,
    parse_decimal,
    parse_money,
    polite_pause,
)

logger = logging.getLogger(__name__)

SOURCE = "kayak"
BASE_URL = "https://www.kayak.com.co/cars"
CARD_SELECTOR = "div.js-result[data-result-id]"
PAGE_TIMEOUT = int(os.environ.get("KAYAK_TIMEOUT", "45"))

_CATEGORY = re.compile(r"o (.+?) similar", re.I)
_OFFER_BUTTON = re.compile(r"Ver oferta de (.+?) de (.+?) desde (\$[\d.,]+)")
_SCORE = re.compile(r"score of (\d+[.,]?\d*)")


def build_url(window: TripWindow) -> str:
    return f"{BASE_URL}/{window.destination}/{window.check_in.isoformat()}/{window.check_out.isoformat()}"


def _new_driver() -> webdriver.Chrome:
    options = Options()
    for arg in (
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
        "--lang=es-CO",
        f"--user-agent={USER_AGENT}",
        "--disable-blink-features=AutomationControlled",
    ):
        options.add_argument(arg)
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    # En Docker se usa el Chromium del sistema; en local, Selenium Manager.
    chrome_bin = os.environ.get("CHROME_BIN")
    if chrome_bin:
        options.binary_location = chrome_bin
    driver_path = os.environ.get("CHROMEDRIVER_PATH")
    service = Service(executable_path=driver_path) if driver_path else Service()

    driver = webdriver.Chrome(options=options, service=service)
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"},
    )
    return driver


def _label(card, name: str) -> str | None:
    el = card.find(attrs={"aria-label": name})
    return el.get_text(" ", strip=True) if el else None


def parse_card(card) -> dict | None:
    title = card.select_one(".js-title")
    if not title:
        return None
    text = card.get_text(" | ", strip=True)

    # Precio: primero el aria-label "Total: $482.719", luego el botón "Ver oferta".
    price = None
    total_el = card.find(attrs={"aria-label": re.compile(r"^Total:")})
    if total_el:
        price = parse_money(total_el["aria-label"])
    offer_btn = card.find(attrs={"aria-label": _OFFER_BUTTON})
    offer = _OFFER_BUTTON.search(offer_btn["aria-label"]) if offer_btn else None
    if price is None and offer:
        price = parse_money(offer.group(3))
    if not price:
        return None

    provider_el = card.select_one("[class*='provider-name']")
    provider = provider_el.get_text(strip=True) if provider_el else (offer.group(2) if offer else None)
    category = _CATEGORY.search(text)
    address = card.select_one("[class*='-address'][aria-label]")
    score_el = card.find(attrs={"aria-label": _SCORE})
    image = card.find("img", src=True)
    passengers = _label(card, "N.º de pasajeros")
    bags = _label(card, "N.º de maletas")

    return {
        "model": title.get_text(strip=True),
        "category": category.group(1).strip() if category else None,
        "provider": provider,
        "total_price_cop": price,
        "passengers": parse_money(passengers),
        "bags": parse_money(bags),
        "doors": _label(card, "N.º de puertas"),
        "transmission": {"M": "Manual", "A": "Automática"}.get(_label(card, "Tipo de transmisión") or "", None),
        "score": parse_decimal(_SCORE.search(score_el["aria-label"]).group(1)) if score_el else None,
        "pickup_location": address["aria-label"].split(",")[0] if address else None,
        "image_url": image["src"] if image else None,
    }


def parse_html(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    results = []
    for card in soup.select(CARD_SELECTOR):
        parsed = parse_card(card)
        if parsed:
            results.append(parsed)
    return results


def scrape(window: TripWindow) -> list[dict]:
    polite_pause()
    try:
        driver = _new_driver()
    except WebDriverException as err:
        raise ScrapeError(f"{SOURCE}: no se pudo iniciar Chrome ({err.msg})") from err
    try:
        driver.get(build_url(window))
        try:
            WebDriverWait(driver, PAGE_TIMEOUT).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, CARD_SELECTOR))
            )
        except TimeoutException as err:
            raise ScrapeEmptyError(f"{SOURCE}: no aparecieron resultados para {window.search_key}") from err

        # Kayak sigue agregando resultados mientras consulta a los proveedores:
        # se espera a que el número de tarjetas se estabilice.
        previous = -1
        for _ in range(8):
            current = len(driver.find_elements(By.CSS_SELECTOR, CARD_SELECTOR))
            if current == previous:
                break
            previous = current
            driver.execute_script("window.scrollBy(0, 1200);")
            time.sleep(2)

        rows = parse_html(driver.page_source)
    except WebDriverException as err:
        raise ScrapeError(f"{SOURCE}: error del navegador ({err.msg})") from err
    finally:
        driver.quit()

    if not rows:
        raise ScrapeEmptyError(f"{SOURCE}: 0 autos para {window.search_key}")
    return rows
