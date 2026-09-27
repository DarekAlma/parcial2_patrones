# =============================================================================
#  Auditoría de la cadena de suministro (Supply Chain Security)
#  Ejecuta npm audit (Node) y pip-audit (Python) sobre TODAS las dependencias
#  del proyecto y guarda la evidencia en docs/security/reports/.
#
#  Uso (PowerShell, desde la raíz del repo):   .\scripts\security\audit.ps1
#  Requisitos: Node 20+, Python 3.11+ (instala pip-audit si falta).
# =============================================================================
$ErrorActionPreference = 'Continue'
$root = Resolve-Path "$PSScriptRoot\..\.."
$out = Join-Path $root 'docs\security\reports'
New-Item -ItemType Directory -Force $out | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd'

Write-Host "== npm audit: backend (workspaces) ==" -ForegroundColor Cyan
Push-Location $root
# Out-File -Encoding utf8 (Tee-Object en PowerShell 5.1 escribe UTF-16).
npm audit --workspaces --include-workspace-root | Out-File -Encoding utf8 "$out\npm-audit-backend-$stamp.txt"
Get-Content "$out\npm-audit-backend-$stamp.txt"
npm audit --workspaces --include-workspace-root --json | Out-File -Encoding utf8 "$out\npm-audit-backend-$stamp.json"
Pop-Location

Write-Host "== npm audit: frontend ==" -ForegroundColor Cyan
Push-Location (Join-Path $root 'frontend')
npm audit | Out-File -Encoding utf8 "$out\npm-audit-frontend-$stamp.txt"
Get-Content "$out\npm-audit-frontend-$stamp.txt"
npm audit --json | Out-File -Encoding utf8 "$out\npm-audit-frontend-$stamp.json"
Pop-Location

python -m pip_audit --version 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { python -m pip install --quiet pip-audit }

foreach ($req in @('pipeline\requirements.txt', 'services\saga-orchestrator\requirements.txt')) {
  $name = ($req -split '\\')[-2]
  Write-Host "== pip-audit: $req ==" -ForegroundColor Cyan
  # pip-audit escribe el resumen por stderr: se capturan ambos flujos con cmd.
  cmd /c "python -m pip_audit -r ""$(Join-Path $root $req)"" --desc --progress-spinner off > ""$out\pip-audit-$name-$stamp.txt"" 2>&1"
  Get-Content "$out\pip-audit-$name-$stamp.txt"
  python -m pip_audit -r (Join-Path $root $req) --format json | Out-File -Encoding utf8 "$out\pip-audit-$name-$stamp.json"
}

Write-Host "`nReportes guardados en $out" -ForegroundColor Green
