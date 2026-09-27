"""Clientes HTTP hacia los participantes de la SAGA.

Traduce las respuestas a dos tipos de error, porque se tratan distinto:
  * TransientStepError -> 5xx / red caída: Prefect REINTENTA el paso.
  * StepRejected       -> 4xx de negocio (sin cupo, pago rechazado): NO se
                          reintenta; se pasa directo a compensar.
"""
from __future__ import annotations

import os

import httpx

FLIGHTS_URL = os.environ.get("FLIGHTS_URL", "http://flights:4101")
HOTELS_URL = os.environ.get("HOTELS_URL", "http://hotels:4102")
CARS_URL = os.environ.get("CARS_URL", "http://cars:4103")
ORDERS_URL = os.environ.get("ORDERS_URL", "http://orders:4104")
INTERNAL_TOKEN = os.environ.get("INTERNAL_API_TOKEN", "")


class StepRejected(Exception):
    def __init__(self, status: int, body: dict):
        self.status = status
        self.body = body
        super().__init__(f"HTTP {status}: {body.get('error')} - {body.get('message')}")


class TransientStepError(Exception):
    def __init__(self, message: str, body: dict | None = None):
        self.body = body or {}
        super().__init__(message)


async def call(method: str, url: str, payload: dict | None = None, simulate_failure: bool = False) -> dict:
    headers = {"x-internal-token": INTERNAL_TOKEN}
    if simulate_failure:
        headers["x-simulate-failure"] = "true"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.request(method, url, json=payload, headers=headers)
    except httpx.HTTPError as err:
        raise TransientStepError(f"Red: {err.__class__.__name__} llamando {url}") from err

    try:
        body = response.json()
    except ValueError:
        body = {"raw": response.text[:300]}

    if response.status_code >= 500 or response.status_code == 429:
        raise TransientStepError(f"HTTP {response.status_code}: {body.get('error')} - {body.get('message')}", body)
    if response.status_code >= 400:
        raise StepRejected(response.status_code, body)
    return body
