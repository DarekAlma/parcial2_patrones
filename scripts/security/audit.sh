#!/usr/bin/env bash
# Auditoría de la cadena de suministro: npm audit + pip-audit.
# Uso: bash scripts/security/audit.sh     (evidencia en docs/security/reports/)
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/docs/security/reports"
STAMP="$(date +%F)"
mkdir -p "$OUT"

echo "== npm audit: backend (workspaces) =="
(cd "$ROOT" && npm audit --workspaces --include-workspace-root | tee "$OUT/npm-audit-backend-$STAMP.txt"
 npm audit --workspaces --include-workspace-root --json > "$OUT/npm-audit-backend-$STAMP.json")

echo "== npm audit: frontend =="
(cd "$ROOT/frontend" && npm audit | tee "$OUT/npm-audit-frontend-$STAMP.txt"
 npm audit --json > "$OUT/npm-audit-frontend-$STAMP.json")

python -m pip_audit --version >/dev/null 2>&1 || python -m pip install --quiet pip-audit
for req in pipeline/requirements.txt services/saga-orchestrator/requirements.txt; do
  name="$(basename "$(dirname "$req")")"
  echo "== pip-audit: $req =="
  python -m pip_audit -r "$ROOT/$req" --desc --progress-spinner off > "$OUT/pip-audit-$name-$STAMP.txt" 2>&1; cat "$OUT/pip-audit-$name-$STAMP.txt"
  python -m pip_audit -r "$ROOT/$req" --format json > "$OUT/pip-audit-$name-$STAMP.json"
done
echo "Reportes guardados en $OUT"
