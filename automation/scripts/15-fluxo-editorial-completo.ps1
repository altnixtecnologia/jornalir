param(
    [ValidateSet("Preflight", "Finalizar")]
    [string]$Mode = "Preflight"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "feature/jornalir-core-foundation-20260917"
$CommitMessage = "feat: completa fluxo editorial do painel"

function Fail($Message) {
    Write-Host ""
    Write-Host "ERRO: $Message" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " JORNALIR - FASE 15 - FLUXO EDITORIAL COMPLETO" -ForegroundColor Cyan
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
        Fail "Fluxo de importacao de PDF nao encontrado. Rode as fases anteriores antes desta."
    }

    if (-not (Test-Path "docs/HANDOFF-CODEX.md")) {
        Fail "HANDOFF-CODEX.md nao encontrado."
    }

    Write-Host ""
    Write-Host "PRE-FLIGHT APROVADO." -ForegroundColor Green
    Write-Host ""
    Write-Host "Agora feche o caminho completo da materia: PDF -> candidato -> revisao"
    Write-Host "-> conversao -> rascunho -> edicao -> editoria/localidade -> multi fotos"
    Write-Host "-> destino editorial -> edicao/pagina -> agendamento/publicacao."
    Write-Host ""
    Write-Host "Quando terminar, rode:"
    Write-Host ""
    Write-Host ".\automation\scripts\15-fluxo-editorial-completo.ps1 -Mode Finalizar" -ForegroundColor Yellow
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
Write-Host "Validando a Fase 15..." -ForegroundColor Cyan
Write-Host ""

npm run typecheck --workspace @ir/sistema

if ($LASTEXITCODE -ne 0) {
    Fail "Typecheck de @ir/sistema falhou. Nao sera feito commit."
}

npm run typecheck --workspace @ir/site

if ($LASTEXITCODE -ne 0) {
    Fail "Typecheck de @ir/site falhou (tipos compartilhados quebraram o portal). Nao sera feito commit."
}

npm run build --workspace @ir/sistema

if ($LASTEXITCODE -ne 0) {
    Fail "Build de @ir/sistema falhou. Nao sera feito commit."
}

foreach ($path in @(
        "apps/sistema/src/features/editorial/DestinoEditorial.tsx",
        "apps/sistema/src/app/sistema/editorial/materias/page.tsx",
        "apps/sistema/src/app/sistema/editorial/importar-pdf/[candidateId]/page.tsx"
    )) {
    if (-not (Test-Path $path)) {
        Fail "Arquivo obrigatorio desta fase nao encontrado: $path"
    }
}

if (Test-Path "apps/sistema/tmp-fase15-validation.mts") {
    Fail "Script de validacao temporario ainda presente — remova antes de commitar (nunca deve ser versionado)."
}

Write-Host ""
Write-Host "Validacao concluida (typecheck sistema + site, build, arquivos obrigatorios presentes)." -ForegroundColor Green
Write-Host ""

Write-Host "Resumo das alteracoes:" -ForegroundColor Cyan
git diff --stat

Write-Host ""
Write-Host "Preparando commit..." -ForegroundColor Cyan

git add apps/sistema packages/core packages/mocks packages/types docs/HANDOFF-CODEX.md automation/prompts/15-fluxo-editorial-completo.md automation/scripts/15-fluxo-editorial-completo.ps1

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
Write-Host " FASE 15 CONCLUIDA" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host ""

git log -1 --oneline

Write-Host ""
Write-Host "Git status:"
git status --short
