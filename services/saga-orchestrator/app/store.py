"""Bitácora de la SAGA (esquema `saga`): ejecución + cada paso/compensación.

Es el "saga log": permite reconstruir en qué paso quedó cada reserva y es lo
que muestra la línea de tiempo del frontend.
"""
from __future__ import annotations

import json
import os

import asyncpg

_pool: asyncpg.Pool | None = None


async def init() -> None:
    global _pool
    ssl = "require" if os.environ.get("PGSSL", "true").lower() == "true" else False
    # statement_cache_size=0: compatible con el pooler de Supabase.
    _pool = await asyncpg.create_pool(
        os.environ["DATABASE_URL"], ssl=ssl, min_size=1, max_size=5, statement_cache_size=0
    )


async def close() -> None:
    if _pool:
        await _pool.close()


async def exists(order_id: str) -> bool:
    return bool(await _pool.fetchval("select 1 from saga.executions where order_id = $1", order_id))


async def start(order_id: str) -> None:
    await _pool.execute(
        "insert into saga.executions (order_id, status) values ($1, 'RUNNING') on conflict (order_id) do nothing",
        order_id,
    )


async def set_flow_run(order_id: str, flow_run_id: str) -> None:
    await _pool.execute("update saga.executions set flow_run_id = $2 where order_id = $1", order_id, flow_run_id)


async def finish(order_id: str, status: str) -> None:
    await _pool.execute(
        "update saga.executions set status = $2, finished_at = now() where order_id = $1", order_id, status
    )


async def add_step(order_id: str, step: str, action: str, status: str, detail: dict | None = None) -> None:
    await _pool.execute(
        "insert into saga.steps (order_id, step, action, status, detail) values ($1, $2, $3, $4, $5::jsonb)",
        order_id, step, action, status, json.dumps(detail or {}, ensure_ascii=False, default=str),
    )


async def get(order_id: str) -> dict | None:
    execution = await _pool.fetchrow("select * from saga.executions where order_id = $1", order_id)
    if not execution:
        return None
    steps = await _pool.fetch(
        "select step, action, status, detail, created_at from saga.steps where order_id = $1 order by id", order_id
    )
    return {
        "orderId": str(execution["order_id"]),
        "status": execution["status"],
        "flowRunId": execution["flow_run_id"],
        "startedAt": execution["started_at"].isoformat(),
        "finishedAt": execution["finished_at"].isoformat() if execution["finished_at"] else None,
        "steps": [
            {
                "step": s["step"],
                "action": s["action"],
                "status": s["status"],
                "detail": json.loads(s["detail"]) if s["detail"] else {},
                "at": s["created_at"].isoformat(),
            }
            for s in steps
        ],
    }
