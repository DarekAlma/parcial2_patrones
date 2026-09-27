"""Estructuración y limpieza de los datos crudos (se ejecuta en los workers de Dask).

Cada fuente entrega dicts "sucios": duplicados (Google repite tarjetas entre
secciones), precios atípicos, textos con espacios, campos faltantes. Aquí se
normalizan con pandas y se les agrega la llave de la ventana de viaje.
"""
from __future__ import annotations

import pandas as pd

from wandersync.config import TripWindow
from wandersync.scrapers.base import stable_id

# Rango de precios razonable (COP). Filtra errores de parsing, p. ej. un
# número de reseñas leído como precio.
PRICE_BOUNDS = {
    "flights": (50_000, 20_000_000),
    "hotels": (20_000, 50_000_000),
    "cars": (50_000, 30_000_000),
}


def _clean_strings(df: pd.DataFrame) -> pd.DataFrame:
    for column in df.select_dtypes(include=["object", "str"]).columns:
        df[column] = df[column].map(lambda v: " ".join(v.split()) if isinstance(v, str) else v)
    return df


# Columnas enteras: pandas las vuelve float cuando hay nulos (40 -> 40.0).
INT_COLUMNS = {
    "price_cop", "stops", "duration_minutes", "price_per_night_cop", "total_price_cop",
    "nights", "reviews", "stars", "passengers", "bags", "days",
}


def _none_if_nan(records: list[dict]) -> list[dict]:
    def native(key, value):
        if value is None or (not isinstance(value, str) and pd.isna(value)):
            return None
        if key in INT_COLUMNS:
            return int(value)
        if isinstance(value, str):
            return value.strip(" ,") or None
        return value

    return [{k: native(k, v) for k, v in row.items()} for row in records]


def clean_flights(raw: list[dict], window: TripWindow, run_id: str, limit: int) -> list[dict]:
    df = _clean_strings(pd.DataFrame(raw))
    if df.empty:
        return []
    low, high = PRICE_BOUNDS["flights"]
    df = df[df["price_cop"].between(low, high)]
    df = df.drop_duplicates(subset=["airline", "depart_time", "arrive_time", "stops"], keep="first")
    df = df.sort_values(["price_cop", "duration_minutes"]).head(limit)

    df["search_key"] = window.search_key
    df["origin"] = window.origin
    df["destination"] = window.destination
    df["departure_date"] = window.check_in.isoformat()
    df["return_date"] = window.check_out.isoformat()
    df["ingestion_run_id"] = run_id
    df["id"] = [
        stable_id("flight", window.search_key, r.airline, r.depart_time, r.arrive_time, r.stops)
        for r in df.itertuples()
    ]
    return _none_if_nan(df.to_dict(orient="records"))


def clean_hotels(raw: list[dict], window: TripWindow, run_id: str, limit: int) -> list[dict]:
    df = _clean_strings(pd.DataFrame(raw))
    if df.empty:
        return []
    low, high = PRICE_BOUNDS["hotels"]
    df = df[df["total_price_cop"].between(low, high)]
    df = df.drop_duplicates(subset=["name"], keep="first")
    # Prioriza hoteles bien calificados dentro de los más económicos.
    df = df.sort_values(["total_price_cop", "rating"], ascending=[True, False]).head(limit)

    df["search_key"] = window.search_key
    df["city_code"] = window.destination
    df["city_name"] = window.city_name
    df["check_in"] = window.check_in.isoformat()
    df["check_out"] = window.check_out.isoformat()
    df["ingestion_run_id"] = run_id
    df["id"] = [stable_id("hotel", window.search_key, r.name) for r in df.itertuples()]
    return _none_if_nan(df.to_dict(orient="records"))


def clean_cars(raw: list[dict], window: TripWindow, run_id: str, limit: int) -> list[dict]:
    df = _clean_strings(pd.DataFrame(raw))
    if df.empty:
        return []
    low, high = PRICE_BOUNDS["cars"]
    df = df[df["total_price_cop"].between(low, high)]
    # El mismo modelo aparece con varios proveedores: se deja la oferta más barata.
    df = df.sort_values("total_price_cop").drop_duplicates(subset=["model", "provider"], keep="first")
    df = df.head(limit)

    df["search_key"] = window.search_key
    df["pickup_code"] = window.destination
    df["pickup_date"] = window.check_in.isoformat()
    df["dropoff_date"] = window.check_out.isoformat()
    df["days"] = window.nights
    df["ingestion_run_id"] = run_id
    df["id"] = [stable_id("car", window.search_key, r.model, r.provider) for r in df.itertuples()]
    return _none_if_nan(df.to_dict(orient="records"))


CLEANERS = {"flights": clean_flights, "hotels": clean_hotels, "cars": clean_cars}
