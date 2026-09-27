"""Publica el flow como deployment de Prefect y queda escuchando ejecuciones.

- Programado: se ejecuta cada INGESTION_INTERVAL_MINUTES (captura continua).
- Bajo demanda: desde la UI de Prefect ("Run") o desde el frontend
  (mutación GraphQL `triggerIngestion`, que llama a la API de Prefect).
- Al arrancar dispara una primera corrida para que el catálogo no esté vacío.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from datetime import timedelta

from prefect import serve
from prefect.deployments import run_deployment
from prefect.deployments.runner import EntrypointType

from wandersync.flows import ingesta_turistica

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("wandersync.serve")

DEPLOYMENT_NAME = "ingesta-programada"
FULL_NAME = f"ingesta-turistica-distribuida/{DEPLOYMENT_NAME}"
INTERVAL_MINUTES = int(os.environ.get("INGESTION_INTERVAL_MINUTES", "360"))
RUN_ON_STARTUP = os.environ.get("INGESTION_RUN_ON_STARTUP", "true").lower() == "true"


def _trigger_first_run() -> None:
    for attempt in range(1, 31):
        try:
            flow_run = run_deployment(FULL_NAME, timeout=0, tags=["arranque"])
            logger.info("Primera ingesta disparada: %s", flow_run.id)
            return
        except Exception as err:  # el deployment aún no está registrado
            logger.info("Esperando el deployment (%d/30): %s", attempt, err)
            time.sleep(4)
    logger.error("No se pudo disparar la ingesta inicial")


if __name__ == "__main__":
    deployment = ingesta_turistica.to_deployment(
        name=DEPLOYMENT_NAME,
        # Entrypoint por módulo ("wandersync.flows:ingesta_turistica") y no por
        # archivo: así las tareas se serializan con un módulo importable y los
        # workers de Dask pueden deserializarlas.
        entrypoint_type=EntrypointType.MODULE_PATH,
        interval=timedelta(minutes=INTERVAL_MINUTES),
        tags=["wandersync", "dask", "scraping"],
        description="Scraping distribuido (Dask) de Google Flights, Google Hotels y Kayak hacia Supabase.",
    )
    if RUN_ON_STARTUP:
        threading.Thread(target=_trigger_first_run, daemon=True).start()
    serve(deployment)
