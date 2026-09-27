"""Utilidades comunes a todos los scrapers: HTTP, errores, caos y parsing."""
from __future__ import annotations

import hashlib
import logging
import random
import re
import time

import requests

from wandersync.config import POLITE_DELAY_RANGE, REQUEST_TIMEOUT, USER_AGENT

logger = logging.getLogger(__name__)


class ScrapeError(Exception):
    """Error recuperable de extracción: Prefect lo reintenta."""


class SimulatedNetworkError(ScrapeError):
    """Fallo de red inyectado a propósito para demostrar los retries de Prefect."""


class ScrapeEmptyError(ScrapeError):
    """La página respondió pero no se encontraron resultados (bloqueo o cambio de HTML)."""


def maybe_inject_failure(chaos_fail_rate: float, source: str) -> None:
    """Inyecta un fallo de red con probabilidad `chaos_fail_rate` (0..1)."""
    if chaos_fail_rate > 0 and random.random() < chaos_fail_rate:
        raise SimulatedNetworkError(
            f"[caos] Fallo de red simulado consultando {source} (tasa={chaos_fail_rate:.0%})"
        )


def polite_pause() -> None:
    time.sleep(random.uniform(*POLITE_DELAY_RANGE))


def new_http_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept-Language": "es-CO,es;q=0.9,en;q=0.7",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
    )
    # Evita la pantalla de consentimiento de cookies de Google.
    session.cookies.set("CONSENT", "YES+cb", domain=".google.com")
    return session


def fetch_html(url: str, source: str) -> str:
    """GET con errores traducidos a ScrapeError (reintentables)."""
    polite_pause()
    try:
        response = new_http_session().get(url, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as err:
        raise ScrapeError(f"{source}: error de red ({err.__class__.__name__}: {err})") from err
    if response.status_code == 429 or response.status_code >= 500:
        raise ScrapeError(f"{source}: HTTP {response.status_code} (limitado o caído)")
    if response.status_code != 200:
        raise ScrapeError(f"{source}: HTTP {response.status_code} inesperado")
    return response.text


_DIGITS = re.compile(r"\d")


def parse_money(text: str | None) -> int | None:
    """'COP 102,229' | '$ 196.191' | '865300' -> 102229 | 196191 | 865300."""
    if not text:
        return None
    digits = "".join(_DIGITS.findall(text))
    return int(digits) if digits else None


def parse_decimal(text: str | None) -> float | None:
    """'9,4' | '4.6' -> 9.4 | 4.6"""
    if not text:
        return None
    match = re.search(r"\d+(?:[.,]\d+)?", text)
    return float(match.group(0).replace(",", ".")) if match else None


def parse_duration_minutes(text: str | None) -> int | None:
    """'1 h 32 min' | '2 h' | '55 min' -> minutos."""
    if not text:
        return None
    hours = re.search(r"(\d+)\s*h", text)
    minutes = re.search(r"(\d+)\s*min", text)
    if not hours and not minutes:
        return None
    return (int(hours.group(1)) * 60 if hours else 0) + (int(minutes.group(1)) if minutes else 0)


def stable_id(*parts: object) -> str:
    """Id determinístico: la misma oferta en dos corridas produce el mismo id (upsert)."""
    raw = "|".join("" if p is None else str(p) for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]
