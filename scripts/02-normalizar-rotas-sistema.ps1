param(
    [ValidateSet("Preflight","Finalizar")]
    [string]$Mode = "Preflight"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "feature/jornalir-core-foundation-20260917"
$CommitMessage = "fix: normaliza rotas do sistema administrativo"

function Fail($Message) {
    Write-Host ""
    Write-Host "ERRO: $Message" -ForegroundColor Red
    exit 1
}

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " JORNALIR - FASE 02 - ROTAS DO SISTEMA" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path ".git")) {
    Fail "Execute este script na raiz do repositorio jornalir."
}

$branch = (git branch --show-current).Trim()
if ($branch -ne $ExpectedBranch) {
    Fail "Branch incorreta: $branch. Esperada: $ExpectedBranch"
}

Write-Host "Branch: $branch"
Write-Host "HEAD:   $((git rev-parse HEAD).Trim())"
Write-Host ""

if ($Mode -eq "Preflight") {
    git status --short

    if (-not (Test-Path "apps/sistema/next.config.mjs")) {
        Fail "apps/sistema/next.config.mjs nao encontrado."
    }

    if (-not (Test-Path "apps/sistema/src/app/sistema")) {
        Fail "apps/sistema/src/app/sistema nao encontrado."
    }

    Write-Host ""
    Write-Host "Preflight aprovado." -ForegroundColor Green
    Write-Host "Entregue ao Codex o prompt da Fase 02."
    exit 0
}

$status = git status --short
if (-not $status) {
    Fail "Nao ha alteracoes para finalizar."
}

Write-Host "Executando validacao unica do bloco..." -ForegroundColor Cyan

npm run typecheck --workspace @ir/sistema
if ($LASTEXITCODE -ne 0) { Fail "Typecheck falhou." }

npm run build --workspace @ir/sistema
if ($LASTEXITCODE -ne 0) { Fail "Build falhou." }

Write-Host ""
Write-Host "Diff resumido:" -ForegroundColor Cyan
git diff --stat

git add apps/sistema docs/HANDOFF-CODEX.md
if ($LASTEXITCODE -ne 0) { Fail "Falha ao adicionar alteracoes." }

$staged = git diff --cached --name-only
if (-not $staged) { Fail "Nenhuma alteracao staged." }

git commit -m $CommitMessage
if ($LASTEXITCODE -ne 0) { Fail "Falha ao criar commit." }

git push -u origin $ExpectedBranch
if ($LASTEXITCODE -ne 0) { Fail "Falha no push." }

Write-Host ""
Write-Host "Estado final:" -ForegroundColor Green
git status --short
git log -1 --oneline
git branch --show-current
