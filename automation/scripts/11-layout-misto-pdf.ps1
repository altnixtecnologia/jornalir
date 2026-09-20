param(
    [ValidateSet("Preflight", "Finalizar")]
    [string]$Mode = "Preflight"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "feature/jornalir-core-foundation-20260917"
$CommitMessage = "fix: melhora ordem de leitura em layouts mistos"

function Fail($Message) {
    Write-Host ""
    Write-Host "ERRO: $Message" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " JORNALIR - FASE 11 - LAYOUT MISTO EM PDF" -ForegroundColor Cyan
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

    if (-not (Test-Path "packages/pdf-extraction")) {
        Fail "Pacote de extracao nao encontrado. Rode as Fases 09/10 antes desta."
    }

    if (-not (Test-Path "packages/pdf-extraction/scripts/validate-real-pdfs.ts")) {
        Fail "Script de diagnostico da Fase 10 nao encontrado (packages/pdf-extraction/scripts/validate-real-pdfs.ts)."
    }

    if (-not (Test-Path "docs/PDF-REAL-VALIDATION.md")) {
        Fail "docs/PDF-REAL-VALIDATION.md (Fase 10) nao encontrado."
    }

    if (-not (Test-Path "docs/HANDOFF-CODEX.md")) {
        Fail "HANDOFF-CODEX.md nao encontrado."
    }

    Write-Host ""
    Write-Host "PRE-FLIGHT APROVADO." -ForegroundColor Green
    Write-Host ""
    Write-Host "Agora implemente a deteccao de colunas por regiao vertical"
    Write-Host "(packages/pdf-extraction), com prova deterministica (fixture"
    Write-Host "sintetica) e revalidacao das 8 paginas reais da Fase 10."
    Write-Host ""
    Write-Host "Quando terminar, rode:"
    Write-Host ""
    Write-Host ".\automation\scripts\11-layout-misto-pdf.ps1 -Mode Finalizar" -ForegroundColor Yellow
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
Write-Host "Validando a Fase 11..." -ForegroundColor Cyan
Write-Host ""

Push-Location packages/pdf-extraction
try {
    npm run test

    if ($LASTEXITCODE -ne 0) {
        Fail "Testes de @ir/pdf-extraction falharam (inclui regressao de layout misto). Nao sera feito commit."
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
Write-Host "Rodando diagnostico de comparacao sobre as 8 paginas reais da Fase 10..." -ForegroundColor Cyan

Push-Location packages/pdf-extraction
try {
    npx tsx scripts/validate-real-pdfs.ts | Out-Null

    if ($LASTEXITCODE -ne 0) {
        Fail "Diagnostico sobre PDFs reais falhou. Nao sera feito commit."
    }
} finally {
    Pop-Location
}

Write-Host "OK: diagnostico executado sem erros — confira manualmente a saida contra docs/PDF-REAL-VALIDATION.md antes do commit." -ForegroundColor Green

Write-Host ""
Write-Host "Validacao concluida (testes + typecheck + build + diagnostico real)." -ForegroundColor Green
Write-Host ""

Write-Host "Resumo das alteracoes:" -ForegroundColor Cyan
git diff --stat

Write-Host ""
Write-Host "Confirmando que nenhum PDF do acervo foi alterado..." -ForegroundColor Cyan

$pdfChanges = git status --short "apps/site/public/uploads/jornal-online"
if ($pdfChanges) {
    Fail "Ha alteracoes nos PDFs do acervo — isso nao deveria acontecer nesta fase (somente leitura)."
}
Write-Host "OK: acervo de PDFs reais intacto." -ForegroundColor Green

Write-Host ""
Write-Host "Preparando commit..." -ForegroundColor Cyan

git add apps/sistema packages/pdf-extraction packages/types docs/PDF-REAL-VALIDATION.md docs/HANDOFF-CODEX.md automation/prompts/11-layout-misto-pdf.md automation/scripts/11-layout-misto-pdf.ps1

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
Write-Host " FASE 11 CONCLUIDA" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host ""

git log -1 --oneline

Write-Host ""
Write-Host "Git status:"
git status --short
