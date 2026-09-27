"""Flow de Prefect que orquesta la ingesta turística sobre el clúster Dask.

    validar_cluster ─┐
    registrar_inicio ┤
                     ├─► extraer[vuelos|hoteles|autos × destino]   (Dask, en paralelo, con retries)
                     │          │  a medida que cada extracción termina (as_completed)
                     │          ▼
                     ├─► transformar_y_cargar[...]                (Dask: limpieza pandas + upsert Supabase)
                     └─► registrar_fin + artefactos en la UI de Prefect

Cada `.submit()` de Prefect es, por debajo, un `client.submit()` de Dask
(DaskTaskRunner): los scrapers corren en los contenedores dask-worker-N y le
reportan estados y logs al servidor de Prefect.
"""
from __future__ import annotations

from prefect import flow, get_run_logger, task
from prefect.artifacts import create_markdown_artifact, create_table_artifact
from prefect.cache_policies import NO_CACHE
from prefect.futures import as_completed
from prefect.runtime import flow_run
from prefect_dask.task_runners import DaskTaskRunner

from wandersync import storage
from wandersync.config import (
    DASK_SCHEDULER_ADDRESS,
    DEFAULT_DAYS_AHEAD,
    DEFAULT_MAX_PER_SOURCE,
    DEFAULT_NIGHTS,
    DEFAULT_ORIGIN,
    TripWindow,
    build_windows,
)
from wandersync.scrapers import SCRAPERS
from wandersync.scrapers.base import maybe_inject_failure
from wandersync.transform import CLEANERS

SOURCE_LABEL = {"flights": "Vuelos · Google Flights", "hotels": "Hoteles · Google Hotels", "cars": "Autos · Kayak"}


def _window_from_dict(data: dict) -> TripWindow:
    from datetime import date

    return TripWindow(
        origin=data["origin"],
        destination=data["destination"],
        city_name=data["city_name"],
        check_in=date.fromisoformat(data["check_in"]),
        check_out=date.fromisoformat(data["check_out"]),
    )


def _worker_name() -> str:
    try:
        from distributed import get_worker

        return get_worker().name
    except ValueError:
        return "local"


# ----------------------------------------------------------------- tareas ---
@task(name="validar_cluster", retries=3, retry_delay_seconds=5, cache_policy=NO_CACHE)
def validar_cluster() -> int:
    """Gobernanza: no se envía trabajo si no hay workers de Dask conectados."""
    from distributed import Client

    logger = get_run_logger()
    with Client(DASK_SCHEDULER_ADDRESS, timeout="15s") as client:
        workers = client.scheduler_info()["workers"]
        names = sorted(w.get("name", addr) for addr, w in workers.items())
    if not workers:
        raise RuntimeError("El clúster Dask no tiene workers conectados")
    logger.info("Clúster Dask listo: %d workers %s", len(names), names)
    return len(names)


@task(name="registrar_inicio", retries=3, retry_delay_seconds=3, cache_policy=NO_CACHE)
def registrar_inicio(run_id: str, run_name: str, chaos_fail_rate: float, windows: int) -> None:
    storage.start_run(run_id, run_name, chaos_fail_rate, windows)


@task(
    name="extraer",
    task_run_name="extraer-{source}-{window[destination]}",
    # Política explícita de reintentos ante fallos de red / extracción:
    # 3 reintentos con backoff creciente y jitter para no golpear la fuente
    # en sincronía desde varios workers.
    retries=3,
    retry_delay_seconds=[3, 8, 15],
    retry_jitter_factor=0.3,
    # Sin timeout_seconds: en hilos de worker Prefect no puede interrumpir I/O
    # bloqueante. Los límites de tiempo están en cada petición (requests 25 s,
    # espera de Kayak 45 s).
    cache_policy=NO_CACHE,
)
def extraer(source: str, window: dict, chaos_fail_rate: float) -> dict:
    logger = get_run_logger()
    worker = _worker_name()
    trip = _window_from_dict(window)
    logger.info("[%s] worker=%s scraping %s", source, worker, trip.search_key)

    maybe_inject_failure(chaos_fail_rate, SOURCE_LABEL[source])
    rows = SCRAPERS[source].scrape(trip)

    logger.info("[%s] worker=%s -> %d registros crudos", source, worker, len(rows))
    return {"source": source, "worker": worker, "rows": rows}


@task(
    name="transformar_y_cargar",
    task_run_name="cargar-{source}-{window[destination]}",
    retries=2,
    retry_delay_seconds=5,
    cache_policy=NO_CACHE,
)
def transformar_y_cargar(source: str, window: dict, extraction: dict, run_id: str, limit: int) -> dict:
    logger = get_run_logger()
    worker = _worker_name()
    trip = _window_from_dict(window)

    clean = CLEANERS[source](extraction["rows"], trip, run_id, limit)
    saved = storage.upsert_offers(source, clean, trip.search_key, run_id)

    logger.info(
        "[%s] worker=%s crudos=%d limpios=%d guardados=%d (%s)",
        source, worker, len(extraction["rows"]), len(clean), saved, trip.search_key,
    )
    return {
        "source": source,
        "destination": trip.destination,
        "raw": len(extraction["rows"]),
        "saved": saved,
        "scrape_worker": extraction["worker"],
        "load_worker": worker,
    }


@task(name="registrar_fin", retries=3, retry_delay_seconds=3, cache_policy=NO_CACHE)
def registrar_fin(run_id: str, status: str, totals: dict, failed: int, detail: list[dict]) -> None:
    storage.finish_run(run_id, status, totals, failed, detail)


# ------------------------------------------------------------------- flow ---
@flow(
    name="ingesta-turistica-distribuida",
    flow_run_name="ingesta-{origin}-{days_ahead}d-caos{chaos_fail_rate}",
    task_runner=DaskTaskRunner(address=DASK_SCHEDULER_ADDRESS),
    log_prints=True,
)
def ingesta_turistica(
    origin: str = DEFAULT_ORIGIN,
    destinations: list[str] | None = None,
    days_ahead: int = DEFAULT_DAYS_AHEAD,
    nights: int = DEFAULT_NIGHTS,
    chaos_fail_rate: float = 0.0,
    max_per_source: int = DEFAULT_MAX_PER_SOURCE,
) -> dict:
    """Extrae vuelos, hoteles y autos de fuentes reales y los persiste en Supabase."""
    logger = get_run_logger()
    run_id = str(flow_run.get_id() or "local")
    run_name = flow_run.get_name() or "local"
    chaos_fail_rate = max(0.0, min(float(chaos_fail_rate), 0.9))

    windows = build_windows(origin, destinations, days_ahead, nights)
    workers = validar_cluster()
    registrar_inicio(run_id, run_name, chaos_fail_rate, len(windows))
    logger.info(
        "Ventanas: %s | fuentes: 3 | tareas de extracción: %d | workers: %d | caos: %.0f%%",
        [w.search_key for w in windows], len(windows) * 3, workers, chaos_fail_rate * 100,
    )

    # Fan-out: una tarea por (fuente, destino) sometida al clúster Dask.
    extractions = {}
    for window in windows:
        for source in SCRAPERS:
            future = extraer.submit(source, window.to_dict(), chaos_fail_rate)
            extractions[future] = (source, window)

    # Pipeline: apenas termina una extracción se somete su carga, sin esperar
    # a las demás (as_completed), así Dask mantiene ocupados a los workers.
    loads = {}
    detail: list[dict] = []
    for future in as_completed(list(extractions)):
        source, window = extractions[future]
        # wait() es inmediato (ya terminó) y fija el estado final que devuelve
        # Dask; sin él, `state` se lee de la API y puede estar desactualizado.
        future.wait()
        if future.state.is_completed():
            load = transformar_y_cargar.submit(source, window.to_dict(), future, run_id, max_per_source)
            loads[load] = (source, window)
        else:
            detail.append(
                {"source": source, "destination": window.destination, "status": "FALLÓ_EXTRACCIÓN",
                 "saved": 0, "error": str(future.state.message)[:200]}
            )
            logger.warning("Extracción agotó reintentos: %s %s -> %s", source, window.destination, future.state.message)

    totals = {"flights": 0, "hotels": 0, "cars": 0}
    for load in as_completed(list(loads)):
        source, window = loads[load]
        load.wait()
        if load.state.is_completed():
            result = load.result()
            totals[source] += result["saved"]
            detail.append({**result, "status": "OK"})
        else:
            detail.append(
                {"source": source, "destination": window.destination, "status": "FALLÓ_CARGA",
                 "saved": 0, "error": str(load.state.message)[:200]}
            )

    failed = sum(1 for d in detail if d["status"] != "OK")
    total_tasks = len(windows) * len(SCRAPERS)
    status = "COMPLETED" if failed == 0 else ("FAILED" if failed == total_tasks else "PARTIAL")
    detail.sort(key=lambda d: (d["destination"], d["source"]))
    registrar_fin(run_id, status, totals, failed, detail)

    create_table_artifact(
        key="ingesta-detalle",
        table=detail,
        description="Resultado por fuente y destino, con el worker de Dask que ejecutó cada etapa.",
    )
    create_markdown_artifact(
        key="ingesta-resumen",
        markdown=(
            f"## Ingesta turística · {status}\n\n"
            f"| Fuente | Ofertas guardadas |\n|---|---|\n"
            f"| Vuelos (Google Flights) | {totals['flights']} |\n"
            f"| Hoteles (Google Hotels) | {totals['hotels']} |\n"
            f"| Autos (Kayak) | {totals['cars']} |\n\n"
            f"Tareas fallidas tras reintentos: **{failed}/{total_tasks}** · "
            f"tasa de caos: **{chaos_fail_rate:.0%}** · workers Dask: **{workers}**\n"
        ),
        description="Resumen de la corrida de ingesta",
    )
    logger.info("Ingesta %s: %s (fallidas %d/%d)", status, totals, failed, total_tasks)

    if status == "FAILED":
        raise RuntimeError("Todas las extracciones fallaron; revisa conectividad o selectores.")
    return {"status": status, "totals": totals, "failed": failed}
