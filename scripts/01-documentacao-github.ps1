param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "feature/jornalir-core-foundation-20260917"
$CommitMessage = "docs: define arquitetura e estado atual do JornalIR"

function Fail($Message) {
    Write-Host ""
    Write-Host "ERRO: $Message" -ForegroundColor Red
    exit 1
}

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " JORNALIR - FASE 01 - DOCUMENTACAO / GITHUB" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path ".git")) {
    Fail "Execute este script na raiz do repositorio jornalir."
}

$branch = (git branch --show-current).Trim()
Write-Host "Branch atual: $branch"

if ($branch -ne $ExpectedBranch) {
    Fail "Branch incorreta. Esperada: $ExpectedBranch."
}

$status = git status --short
Write-Host "Git status:"
if ($status) {
    $status | ForEach-Object { Write-Host "  $_" }
} else {
    Write-Host "  limpo"
}

$expectedPaths = @(
    "docs/PLANO-MESTRE-JORNALIR.md",
    "docs/PROMPT-MESTRE-CODEX-JORNALIR.md",
    "docs/CURRENT-STATE.md",
    "docs/ARCHITECTURE.md",
    "docs/FRONTEND-STRUCTURE.md",
    "docs/DATA-BOUNDARIES.md",
    "docs/HANDOFF-CODEX.md"
)

foreach ($path in $expectedPaths) {
    if (-not (Test-Path $path)) {
        Fail "Arquivo obrigatorio ausente: $path"
    }
}

$changedPaths = @()
foreach ($line in $status) {
    if ($line.Length -ge 4) {
        $changedPaths += $line.Substring(3).Trim()
    }
}

$unexpected = $changedPaths | Where-Object {
    ($_ -notlike "docs/*") -and
    ($_ -ne "REESTRUTURACAO-PROJETO-GPT.md")
}

if ($unexpected) {
    Write-Host ""
    Write-Host "Alteracoes fora do escopo documental:" -ForegroundColor Yellow
    $unexpected | ForEach-Object { Write-Host "  $_" }
    Fail "Revise essas alteracoes antes de continuar."
}

if ($DryRun) {
    Write-Host ""
    Write-Host "DRY RUN aprovado. Nenhum commit/push executado." -ForegroundColor Green
    exit 0
}

git add docs
if (Test-Path "REESTRUTURACAO-PROJETO-GPT.md") {
    git add "REESTRUTURACAO-PROJETO-GPT.md"
}

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nenhuma alteracao staged. Nada para commitar." -ForegroundColor Yellow
    exit 0
}

git commit -m $CommitMessage
if ($LASTEXITCODE -ne 0) { Fail "Falha ao criar commit." }

git push -u origin $ExpectedBranch
if ($LASTEXITCODE -ne 0) { Fail "Falha no push." }

Write-Host ""
Write-Host "Estado final:" -ForegroundColor Green
git status --short
git log -1 --oneline
git branch --show-current
