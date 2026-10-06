param(
  [string]$From = "2026-09-26",
  [string]$To = "2026-09-28"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Find-EnvFile {
  $candidates = @(
    (Join-Path $RepoRoot ".env.local"),
    (Join-Path $RepoRoot "apps\sistema\.env.local"),
    (Join-Path $RepoRoot "scripts\legacy-audit\.env.local")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      $raw = Get-Content $candidate -Raw
      if ($raw -match "SUPABASE_SERVICE_ROLE_KEY\s*=" -and $raw -match "NEXT_PUBLIC_SUPABASE_URL\s*=") {
        return $candidate
      }
    }
  }

  throw "Nao encontrei um .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
}

$EnvFile = Find-EnvFile

Write-Host ""
Write-Host "== Atualizando inventario recente do site antigo ==" -ForegroundColor Cyan
node "scripts/legacy-audit/audit.mjs" --refresh-pages=10 --sample-detail=1 --rps=4
if ($LASTEXITCODE -ne 0) { throw "Falha ao atualizar o inventario." }

Write-Host ""
Write-Host "== Preflight incremental: $From ate $To ==" -ForegroundColor Cyan
node --env-file="$EnvFile" "scripts/legacy-audit/migrate.mjs" --batch=2025-2026 --mode=preflight --from=$From --to=$To --rps=4
if ($LASTEXITCODE -ne 0) { throw "Falha no preflight incremental." }

Write-Host ""
Write-Host "== Importacao incremental real: $From ate $To ==" -ForegroundColor Yellow
node --env-file="$EnvFile" "scripts/legacy-audit/migrate.mjs" --batch=2025-2026 --mode=import --commit --from=$From --to=$To --rps=4
if ($LASTEXITCODE -ne 0) { throw "Falha na importacao incremental." }

Write-Host ""
Write-Host "Concluido. Materias do periodo $From ate $To foram reconciliadas/importadas sem reabrir o lote historico." -ForegroundColor Green
