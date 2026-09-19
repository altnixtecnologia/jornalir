param(
    [ValidateSet("Preflight", "Finalizar")]
    [string]$Mode = "Preflight"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "feature/jornalir-core-foundation-20260917"
$CommitMessage = "feat: estrutura dominio editorial do JornalIR"

function Fail($Message) {
    Write-Host ""
    Write-Host "ERRO: $Message" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " JORNALIR - FASE 04 - DOMINIO EDITORIAL" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path ".git")) {
    Fail "Execute este script na raiz do projeto jornalir."
}

$branch = (git branch --show-current).Trim()
$head = (git rev-parse HEAD).Trim()

Write-Host "Branch: $branch"
Write-Host "HEAD:   $head"
Write-Host ""

if ($branch -ne $ExpectedBranch) {
    Fail "Branch incorreta. Esperada: $ExpectedBranch"
}

if ($Mode -eq "Preflight") {

    Write-Host "Estado atual:" -ForegroundColor Cyan
    git status --short

    if (-not (Test-Path "packages/types")) {
        Fail "packages/types nao encontrado."
    }

    if (-not (Test-Path "packages/mocks")) {
        Fail "packages/mocks nao encontrado."
    }

    if (-not (Test-Path "apps/sistema")) {
        Fail "apps/sistema nao encontrado."
    }

    if (-not (Test-Path "docs/PLANO-MESTRE-JORNALIR.md")) {
        Fail "Plano Mestre nao encontrado em docs."
    }

    if (-not (Test-Path "docs/HANDOFF-CODEX.md")) {
        Fail "HANDOFF-CODEX.md nao encontrado."
    }

    Write-Host ""
    Write-Host "PRE-FLIGHT APROVADO." -ForegroundColor Green
    Write-Host ""
    Write-Host "Agora execute o trabalho da Fase 04 (packages/types, packages/core,"
    Write-Host "packages/mocks e o ponto de composicao em apps/sistema)."
    Write-Host ""
    Write-Host "Quando terminar, rode:"
    Write-Host ""
    Write-Host ".\automation\scripts\04-dominio-editorial.ps1 -Mode Finalizar" -ForegroundColor Yellow
    Write-Host ""

    exit 0
}

Write-Host "Alteracoes encontradas:" -ForegroundColor Cyan

$status = git status --short

if (-not $status) {
    Fail "Nao existem alteracoes para finalizar."
}

$status | ForEach-Object {
    Write-Host "  $_"
}

Write-Host ""
Write-Host "Validando a Fase 04..." -ForegroundColor Cyan
Write-Host ""

npm run typecheck --workspace @ir/sistema

if ($LASTEXITCODE -ne 0) {
    Fail "Typecheck de @ir/sistema falhou. Nao sera feito commit."
}

npm run build --workspace @ir/sistema

if ($LASTEXITCODE -ne 0) {
    Fail "Build de @ir/sistema falhou. Nao sera feito commit."
}

npm run typecheck --workspace @ir/site

if ($LASTEXITCODE -ne 0) {
    Fail "Typecheck de @ir/site falhou. Nao sera feito commit."
}

Write-Host ""
Write-Host "Validacao concluida." -ForegroundColor Green
Write-Host ""

Write-Host "Resumo das alteracoes:" -ForegroundColor Cyan
git diff --stat

Write-Host ""
Write-Host "Preparando commit..." -ForegroundColor Cyan

# Inclui tambem eventual trabalho de fases anteriores ainda nao commitado
# (documentacao do Lote 1 e shell administrativo da Fase 03), pois o HEAD
# desta branch nao tinha nenhum commit proprio ate este ponto.
git add -A

if ($LASTEXITCODE -ne 0) {
    Fail "Falha ao adicionar arquivos."
}

$staged = git diff --cached --name-only

if (-not $staged) {
    Fail "Nenhum arquivo foi preparado para commit."
}

Write-Host ""
Write-Host "Arquivos do commit:" -ForegroundColor Cyan

$staged | ForEach-Object {
    Write-Host "  $_"
}

Write-Host ""
Write-Host "Criando commit..." -ForegroundColor Cyan

git commit -m $CommitMessage

if ($LASTEXITCODE -ne 0) {
    Fail "Falha ao criar commit."
}

Write-Host ""
Write-Host "Enviando para o GitHub..." -ForegroundColor Cyan

git push -u origin $ExpectedBranch

if ($LASTEXITCODE -ne 0) {
    Fail "Falha no push."
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " FASE 04 CONCLUIDA" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host ""

git log -1 --oneline

Write-Host ""
Write-Host "Git status:"
git status --short
