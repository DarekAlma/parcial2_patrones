"""Prueba rápida de un scraper sin Docker, Dask ni base de datos.

    python -m wandersync.cli flights --dest CTG
    python -m wandersync.cli hotels  --dest MDE --days-ahead 20
    python -m wandersync.cli cars    --dest SMR --json

Útil para verificar selectores antes de la demo en vivo.
"""
from __future__ import annotations

import argparse
import json

from wandersync.config import DEFAULT_DAYS_AHEAD, DEFAULT_NIGHTS, DEFAULT_ORIGIN, build_windows
from wandersync.scrapers import SCRAPERS
from wandersync.transform import CLEANERS


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrapers de WanderSync")
    parser.add_argument("source", choices=sorted(SCRAPERS))
    parser.add_argument("--origin", default=DEFAULT_ORIGIN)
    parser.add_argument("--dest", default="CTG")
    parser.add_argument("--days-ahead", type=int, default=DEFAULT_DAYS_AHEAD)
    parser.add_argument("--nights", type=int, default=DEFAULT_NIGHTS)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--json", action="store_true", help="Imprime el resultado limpio como JSON")
    args = parser.parse_args()

    window = build_windows(args.origin, [args.dest], args.days_ahead, args.nights)[0]
    print(f"Consultando {args.source} para {window.search_key} ...")
    raw = SCRAPERS[args.source].scrape(window)
    clean = CLEANERS[args.source](raw, window, "cli", args.limit)

    if args.json:
        print(json.dumps(clean, ensure_ascii=False, indent=2, default=str))
        return
    print(f"Crudos: {len(raw)} | limpios: {len(clean)}\n")
    for i, row in enumerate(clean, 1):
        name = row.get("airline") or row.get("name") or row.get("model")
        price = row.get("price_cop") or row.get("total_price_cop")
        extra = row.get("depart_time") or row.get("rating") or row.get("provider")
        print(f"{i:>2}. {name:<40} ${price:>12,}  {extra or ''}")


if __name__ == "__main__":
    main()
