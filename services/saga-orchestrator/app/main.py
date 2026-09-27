"""API del orquestador de la SAGA (FastAPI).

POST /sagas             inicia la SAGA de una orden (202, asíncrono)
GET  /sagas/{order_id}  estado + bitácora de pasos (timeline del frontend)
"""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app import store
from app.saga import saga_reserva_paquete

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("saga-orchestrator")
INTERNAL_TOKEN = os.environ.get("INTERNAL_API_TOKEN", "")

# Referencias a las sagas en curso (evita que el GC cancele las tareas).
_running: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await store.init()
    yield
    await store.close()


app = FastAPI(title="WanderSync · SAGA Orchestrator", lifespan=lifespan)


def internal_only(x_internal_token: str | None = Header(default=None)) -> None:
    if INTERNAL_TOKEN and x_internal_token != INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED_INTERNAL")


class SagaRequest(BaseModel):
    orderId: UUID
    flightOfferId: str = Field(min_length=1, max_length=64)
    hotelOfferId: str = Field(min_length=1, max_length=64)
    carOfferId: str = Field(min_length=1, max_length=64)
    travelers: int = Field(ge=1, le=4)
    amountCop: int = Field(gt=0)
    simulateFailure: Literal["NONE", "FLIGHT", "HOTEL", "CAR", "PAYMENT"] = "NONE"


async def _run(req: SagaRequest) -> None:
    order_id = str(req.orderId)
    try:
        await saga_reserva_paquete(
            order_id=order_id,
            flight_offer_id=req.flightOfferId,
            hotel_offer_id=req.hotelOfferId,
            car_offer_id=req.carOfferId,
            travelers=req.travelers,
            amount_cop=req.amountCop,
            simulate_failure=req.simulateFailure,
        )
    except Exception:  # el flow ya dejó registro en Prefect y en saga.steps
        logger.exception("SAGA %s terminó con error", order_id)


@app.get("/health")
async def health():
    return {"ok": True, "service": "saga-orchestrator"}


@app.post("/sagas", status_code=202, dependencies=[Depends(internal_only)])
async def start_saga(req: SagaRequest):
    order_id = str(req.orderId)
    if await store.exists(order_id):  # idempotencia: una SAGA por orden
        return {"orderId": order_id, "status": "ALREADY_STARTED"}
    await store.start(order_id)
    job = asyncio.create_task(_run(req))
    _running.add(job)
    job.add_done_callback(_running.discard)
    logger.info("SAGA %s iniciada (simulateFailure=%s)", order_id, req.simulateFailure)
    return {"orderId": order_id, "status": "STARTED"}


@app.get("/sagas/{order_id}", dependencies=[Depends(internal_only)])
async def get_saga(order_id: UUID):
    saga = await store.get(str(order_id))
    if not saga:
        raise HTTPException(status_code=404, detail="SAGA_NOT_FOUND")
    return saga
