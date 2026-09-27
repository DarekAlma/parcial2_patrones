"""SAGA orquestada de reserva de paquete turístico (flow de Prefect).

    Acción (T)                      Compensación (C)
    ─────────────────────────────   ─────────────────────────────
    T1 reservar_vuelo      ───────► C1 cancelar_vuelo
    T2 reservar_hotel      ───────► C2 cancelar_hotel
    T3 reservar_auto       ───────► C3 cancelar_auto
    T4 procesar_pago       ───────► C4 reembolsar_pago
    T5 confirmar_orden     (pivote: emite factura, ya no se compensa)

Si falla Tn, se ejecutan C(n-1) … C1 en orden inverso. Garantías:
  * Idempotencia: cada participante usa el order_id como sagaId, así los
    reintentos de Prefect nunca duplican reservas ni cobros.
  * Reintentos solo para fallos transitorios (5xx/red); los rechazos de
    negocio (4xx) van directo a compensación.
  * Las compensaciones se reintentan hasta 5 veces: deben terminar.
"""
from __future__ import annotations

import asyncio
import os

from prefect import flow, get_run_logger, task
from prefect.cache_policies import NO_CACHE
from prefect.runtime import flow_run, task_run
from prefect.states import Completed

from app import store
from app.clients import CARS_URL, FLIGHTS_URL, HOTELS_URL, ORDERS_URL, StepRejected, TransientStepError, call

STEP_DELAY = float(os.environ.get("SAGA_STEP_DELAY_SECONDS", "1.5"))


def retry_only_transient(_task, _task_run, state) -> bool:
    """Prefect reintenta solo si el error es transitorio.

    El motor de Prefect entrega un estado Failed cuyo `data` es la excepción
    original (no se usa `state.result()`: en tareas async devuelve una corrutina).
    """
    return isinstance(state.data, TransientStepError)


async def _attempt(order_id: str, step: str, action: str = "EXECUTE") -> None:
    attempt = task_run.get_run_count() or 1
    await store.add_step(order_id, step, action, "RUNNING", {"attempt": attempt})
    await asyncio.sleep(STEP_DELAY)  # hace visible cada paso en la demo


ACTION = dict(retries=2, retry_delay_seconds=2, retry_condition_fn=retry_only_transient, cache_policy=NO_CACHE)
COMPENSATION = dict(retries=5, retry_delay_seconds=2, cache_policy=NO_CACHE)


# ------------------------------------------------------------- acciones ---
@task(name="T1 · reservar_vuelo", **ACTION)
async def reservar_vuelo(order_id: str, offer_id: str, travelers: int, fail: bool) -> dict:
    await _attempt(order_id, "FLIGHT")
    return await call("POST", f"{FLIGHTS_URL}/reservations",
                      {"sagaId": order_id, "offerId": offer_id, "passengers": travelers}, fail)


@task(name="T2 · reservar_hotel", **ACTION)
async def reservar_hotel(order_id: str, offer_id: str, travelers: int, fail: bool) -> dict:
    await _attempt(order_id, "HOTEL")
    return await call("POST", f"{HOTELS_URL}/reservations",
                      {"sagaId": order_id, "offerId": offer_id, "guests": travelers}, fail)


@task(name="T3 · reservar_auto", **ACTION)
async def reservar_auto(order_id: str, offer_id: str, _travelers: int, fail: bool) -> dict:
    await _attempt(order_id, "CAR")
    return await call("POST", f"{CARS_URL}/reservations", {"sagaId": order_id, "offerId": offer_id}, fail)


@task(name="T4 · procesar_pago", **ACTION)
async def procesar_pago(order_id: str, amount_cop: int, fail: bool) -> dict:
    await _attempt(order_id, "PAYMENT")
    return await call("POST", f"{ORDERS_URL}/payments", {"orderId": order_id, "amountCop": amount_cop}, fail)


@task(name="T5 · confirmar_orden", **ACTION)
async def confirmar_orden(order_id: str) -> dict:
    await _attempt(order_id, "CONFIRMATION")
    return await call("POST", f"{ORDERS_URL}/orders/{order_id}/confirm")


# -------------------------------------------------------- compensaciones ---
@task(name="C1 · cancelar_vuelo", **COMPENSATION)
async def cancelar_vuelo(order_id: str) -> dict:
    await _attempt(order_id, "FLIGHT", "COMPENSATE")
    return await call("POST", f"{FLIGHTS_URL}/reservations/{order_id}/cancel")


@task(name="C2 · cancelar_hotel", **COMPENSATION)
async def cancelar_hotel(order_id: str) -> dict:
    await _attempt(order_id, "HOTEL", "COMPENSATE")
    return await call("POST", f"{HOTELS_URL}/reservations/{order_id}/cancel")


@task(name="C3 · cancelar_auto", **COMPENSATION)
async def cancelar_auto(order_id: str) -> dict:
    await _attempt(order_id, "CAR", "COMPENSATE")
    return await call("POST", f"{CARS_URL}/reservations/{order_id}/cancel")


@task(name="C4 · reembolsar_pago", **COMPENSATION)
async def reembolsar_pago(order_id: str) -> dict:
    await _attempt(order_id, "PAYMENT", "COMPENSATE")
    return await call("POST", f"{ORDERS_URL}/payments/{order_id}/refund")


def _describe(err: Exception) -> dict:
    if isinstance(err, StepRejected):
        return {"type": "RECHAZO_DE_NEGOCIO", "http": err.status, **err.body}
    if isinstance(err, TransientStepError):
        return {"type": "FALLO_TRANSITORIO_AGOTÓ_REINTENTOS", "message": str(err), **err.body}
    return {"type": err.__class__.__name__, "message": str(err)}


# ------------------------------------------------------------------ flow ---
@flow(name="saga-reserva-paquete", flow_run_name="saga-{order_id}", log_prints=True)
async def saga_reserva_paquete(
    order_id: str,
    flight_offer_id: str,
    hotel_offer_id: str,
    car_offer_id: str,
    travelers: int,
    amount_cop: int,
    simulate_failure: str = "NONE",
):
    logger = get_run_logger()
    await store.set_flow_run(order_id, str(flow_run.get_id()))
    await call("PATCH", f"{ORDERS_URL}/orders/{order_id}/status", {"status": "PROCESSING"})

    plan = [
        ("FLIGHT", lambda: reservar_vuelo(order_id, flight_offer_id, travelers, simulate_failure == "FLIGHT"), cancelar_vuelo),
        ("HOTEL", lambda: reservar_hotel(order_id, hotel_offer_id, travelers, simulate_failure == "HOTEL"), cancelar_hotel),
        ("CAR", lambda: reservar_auto(order_id, car_offer_id, travelers, simulate_failure == "CAR"), cancelar_auto),
        ("PAYMENT", lambda: procesar_pago(order_id, amount_cop, simulate_failure == "PAYMENT"), reembolsar_pago),
        ("CONFIRMATION", lambda: confirmar_orden(order_id), None),
    ]
    done: list[tuple[str, object]] = []  # pila de compensaciones pendientes

    for step, action, compensation in plan:
        try:
            result = await action()
        except Exception as err:  # noqa: BLE001 - cualquier fallo dispara compensación
            detail = _describe(err)
            await store.add_step(order_id, step, "EXECUTE", "FAILED", detail)
            logger.warning("Paso %s falló (%s). Compensando %d paso(s) en orden inverso: %s",
                           step, detail["type"], len(done), [s for s, _ in reversed(done)])

            for done_step, compensate in reversed(done):
                try:
                    body = await compensate(order_id)
                    await store.add_step(order_id, done_step, "COMPENSATE", "COMPENSATED", body)
                except Exception as comp_err:  # noqa: BLE001
                    # Compensación agotó reintentos: requiere intervención humana.
                    await store.add_step(order_id, done_step, "COMPENSATE", "FAILED", _describe(comp_err))
                    await store.finish(order_id, "FAILED")
                    await call("PATCH", f"{ORDERS_URL}/orders/{order_id}/status",
                               {"status": "FAILED", "reason": f"Compensación de {done_step} falló"})
                    raise

            reason = f"Falló {step}: {detail.get('message') or detail.get('error') or detail['type']}"
            await call("PATCH", f"{ORDERS_URL}/orders/{order_id}/status", {"status": "COMPENSATED", "reason": reason})
            await store.finish(order_id, "COMPENSATED")
            logger.info("SAGA %s compensada: sistema consistente, sin reservas huérfanas.", order_id)
            return Completed(name="Compensada", message=reason)

        await store.add_step(order_id, step, "EXECUTE", "SUCCESS", result)
        if compensation:
            done.append((step, compensation))

    await store.finish(order_id, "COMPLETED")
    logger.info("SAGA %s completada: vuelo, hotel, auto, pago y factura confirmados.", order_id)
    return Completed(message="Paquete confirmado")
