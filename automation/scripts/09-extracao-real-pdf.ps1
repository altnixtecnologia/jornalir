param(
    [ValidateSet("Preflight", "Finalizar")]
    [string]$Mode = "Preflight"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "feature/jornalir-core-foundation-20260917"
$CommitMessage = "feat: adiciona extracao fiel de materias do PDF"

function Fail($Message) {
    Write-Host ""
    Write-Host "ERRO: $Message" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " JORNALIR - FASE 09 - EXTRACAO REAL DE PDF" -ForegroundColor Cyan
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

    if (-not (Test-Path "apps/sistema/src/app/sistema/editorial/importar-pdf")) {
        Fail "Fluxo de importacao de PDF nao encontrado. Rode a Fase 08 antes desta."
    }

    if (-not (Test-Path "docs/HANDOFF-CODEX.md")) {
        Fail "HANDOFF-CODEX.md nao encontrado."
    }

    Write-Host ""
    Write-Host "PRE-FLIGHT APROVADO." -ForegroundColor Green
    Write-Host ""
    Write-Host "Agora execute o trabalho da Fase 09 (extracao real de PDF, pipeline"
    Write-Host "isolado em @ir/pdf-extraction, com testes de fidelidade textual)."
    Write-Host ""
    Write-Host "Quando terminar, rode:"
    Write-Host ""
    Write-Host ".\automation\scripts\09-extracao-real-pdf.ps1 -Mode Finalizar" -ForegroundColor Yellow
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
Write-Host "Validando a Fase 09..." -ForegroundColor Cyan
Write-Host ""

Push-Location packages/pdf-extraction
try {
    npm run test

    if ($LASTEXITCODE -ne 0) {
        Fail "Testes de fidelidade de @ir/pdf-extraction falharam. Nao sera feito commit."
    }
} finally {
    Pop-Location
}

npm run typecheck --workspace @ir/sistema

if ($LASTEXITCODE -ne 0) {
    Fail "Typecheck de @ir/sistema falhou. Nao sera feito commit."
}

npm run build --workspace @ir/sistema

if ($LASTEXITCODE -ne 0) {
    Fail "Build de @ir/sistema falhou. Nao sera feito commit."
}

Write-Host ""
Write-Host "Validacao concluida (testes de fidelidade + typecheck + build)." -ForegroundColor Green
Write-Host ""

Write-Host "Resumo das alteracoes:" -ForegroundColor Cyan
git diff --stat

Write-Host ""
Write-Host "Preparando commit..." -ForegroundColor Cyan

git add apps/sistema packages/core packages/mocks packages/types packages/pdf-extraction package.json package-lock.json automation/prompts/09-extracao-real-pdf.md automation/scripts/09-extracao-real-pdf.ps1

if (Test-Path "docs/HANDOFF-CODEX.md") {
    git add docs/HANDOFF-CODEX.md
}

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
Write-Host " FASE 09 CONCLUIDA" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host ""

git log -1 --oneline

Write-Host ""
Write-Host "Git status:"
git status --short
