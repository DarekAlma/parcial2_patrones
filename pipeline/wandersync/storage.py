"""Persistencia en Supabase (Postgres) directamente desde los workers de Dask.

Upsert idempotente: la misma oferta (mismo id determinístico) actualiza precio
y fecha de scraping, pero NUNCA pisa el inventario disponible
(seats/rooms/units_available), porque ese lo administran los microservicios
cuando se reserva o se compensa.
"""
from __future__ import annotations

import json
from contextlib import contextmanager

import psycopg

from wandersync.config import DATABASE_URL, PGSSL

TABLES = {
    "flights": {
        "table": "public.flight_offers",
        "columns": [
            "id", "search_key", "origin", "destination", "departure_date", "return_date",
            "airline", "operated_by", "stops", "depart_time", "arrive_time", "duration_minutes",
            "origin_airport", "destination_airport", "price_cop", "ingestion_run_id",
        ],
    },
    "hotels": {
        "table": "public.hotel_offers",
        "columns": [
            "id", "search_key", "city_code", "city_name", "check_in", "check_out", "nights", "name",
            "price_per_night_cop", "total_price_cop", "rating", "reviews", "stars", "deal",
            "amenities", "image_url", "detail_url", "ingestion_run_id",
        ],
    },
    "cars": {
        "table": "public.car_offers",
        "columns": [
            "id", "search_key", "pickup_code", "pickup_location", "pickup_date", "dropoff_date",
            "days", "model", "category", "provider", "total_price_cop", "passengers", "bags",
            "doors", "transmission", "score", "image_url", "ingestion_run_id",
        ],
    },
}


@contextmanager
def connect():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL no está configurada")
    # prepare_threshold=None: compatible con el pooler de Supabase (Supavisor).
    with psycopg.connect(
        DATABASE_URL,
        sslmode="require" if PGSSL else "disable",
        prepare_threshold=None,
        connect_timeout=15,
    ) as conn:
        yield conn


def upsert_offers(kind: str, rows: list[dict], search_key: str, run_id: str) -> int:
    """Inserta/actualiza las ofertas y desactiva las que ya no aparecieron."""
    spec = TABLES[kind]
    columns = spec["columns"]
    updates = ", ".join(f"{c} = excluded.{c}" for c in columns if c != "id")
    sql = (
        f"insert into {spec['table']} ({', '.join(columns)}) "
        f"values ({', '.join(['%s'] * len(columns))}) "
        f"on conflict (id) do update set {updates}, is_active = true, scraped_at = now()"
    )
    with connect() as conn, conn.cursor() as cur:
        if rows:
            cur.executemany(sql, [[row.get(c) for c in columns] for row in rows])
        cur.execute(
            f"update {spec['table']} set is_active = false "
            f"where search_key = %s and ingestion_run_id is distinct from %s",
            (search_key, run_id),
        )
    return len(rows)


def start_run(run_id: str, flow_run_name: str, chaos_fail_rate: float, windows: int) -> None:
    with connect() as conn:
        conn.execute(
            "insert into public.ingestion_runs (id, flow_run_name, status, chaos_fail_rate, windows) "
            "values (%s, %s, 'RUNNING', %s, %s) on conflict (id) do nothing",
            (run_id, flow_run_name, chaos_fail_rate, windows),
        )


def finish_run(run_id: str, status: str, totals: dict, failed_tasks: int, detail: list[dict]) -> None:
    with connect() as conn:
        conn.execute(
            "update public.ingestion_runs set status = %s, flights = %s, hotels = %s, cars = %s, "
            "failed_tasks = %s, detail = %s::jsonb, finished_at = now() where id = %s",
            (
                status,
                totals.get("flights", 0),
                totals.get("hotels", 0),
                totals.get("cars", 0),
                failed_tasks,
                json.dumps(detail, ensure_ascii=False),
                run_id,
            ),
        )
