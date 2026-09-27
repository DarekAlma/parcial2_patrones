"""Configuración central del pipeline: destinos, ventanas de viaje y entorno."""
from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from datetime import date, timedelta

# --- Infraestructura ---------------------------------------------------------
DASK_SCHEDULER_ADDRESS = os.environ.get("DASK_SCHEDULER_ADDRESS", "tcp://dask-scheduler:8786")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
PGSSL = os.environ.get("PGSSL", "true").lower() == "true"

# --- Scraping ----------------------------------------------------------------
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = int(os.environ.get("SCRAPER_TIMEOUT", "25"))
# Pausa "cortés" entre peticiones para no saturar las fuentes (fines académicos).
POLITE_DELAY_RANGE = (1.0, 2.5)

# Origen por defecto y destinos del catálogo. El nombre de ciudad se usa en
# Google Hotels; el código IATA en Google Flights y Kayak.
DEFAULT_ORIGIN = os.environ.get("INGESTION_ORIGIN", "BOG")
DESTINATIONS: dict[str, str] = {
    "CTG": "Cartagena",
    "SMR": "Santa Marta",
    "MDE": "Medellín",
    "CLO": "Cali",
}
DEFAULT_DESTINATIONS = [
    d.strip().upper()
    for d in os.environ.get("INGESTION_DESTINATIONS", ",".join(DESTINATIONS)).split(",")
    if d.strip()
]
DEFAULT_DAYS_AHEAD = int(os.environ.get("INGESTION_DAYS_AHEAD", "30"))
DEFAULT_NIGHTS = int(os.environ.get("INGESTION_NIGHTS", "3"))
DEFAULT_MAX_PER_SOURCE = int(os.environ.get("INGESTION_MAX_PER_SOURCE", "12"))


@dataclass(frozen=True)
class TripWindow:
    """Una búsqueda concreta: origen → destino entre dos fechas.

    Las tres fuentes (vuelos, hoteles, autos) se consultan con la misma ventana,
    y comparten `search_key`, que es lo que luego une un paquete en el Gateway.
    """

    origin: str
    destination: str
    city_name: str
    check_in: date
    check_out: date

    @property
    def nights(self) -> int:
        return (self.check_out - self.check_in).days

    @property
    def search_key(self) -> str:
        return f"{self.origin}-{self.destination}-{self.check_in.isoformat()}-{self.check_out.isoformat()}"

    def to_dict(self) -> dict:
        data = asdict(self)
        data["check_in"] = self.check_in.isoformat()
        data["check_out"] = self.check_out.isoformat()
        data["search_key"] = self.search_key
        return data


def build_windows(
    origin: str = DEFAULT_ORIGIN,
    destinations: list[str] | None = None,
    days_ahead: int = DEFAULT_DAYS_AHEAD,
    nights: int = DEFAULT_NIGHTS,
    today: date | None = None,
) -> list[TripWindow]:
    today = today or date.today()
    check_in = today + timedelta(days=days_ahead)
    check_out = check_in + timedelta(days=nights)
    windows = []
    for code in destinations or DEFAULT_DESTINATIONS:
        code = code.upper()
        if code not in DESTINATIONS:
            raise ValueError(f"Destino no soportado: {code}. Opciones: {sorted(DESTINATIONS)}")
        windows.append(TripWindow(origin.upper(), code, DESTINATIONS[code], check_in, check_out))
    return windows
