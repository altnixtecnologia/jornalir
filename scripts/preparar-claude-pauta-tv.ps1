<#
.SYNOPSIS
  Sincroniza com segurança o VS Code local e prepara a Claude para criar o APK da Pauta TV.
.DESCRIPTION
  Não faz reset, rebase, clean, stash, push, migration, deploy ou instalação.
  Precisa ser executado a partir de uma cópia Git do repositório oficial.
.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\preparar-claude-pauta-tv.ps1
.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\preparar-claude-pauta-tv.ps1 -StartClaude
#>
[CmdletBinding()]
param(
    [switch]$StartClaude,
    [switch]$OpenVSCode
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedRepo = 'altnixtecnologia/jornalir'
$TargetBranch = 'solicitacoes-financeiro-contratos-irc-20261031'
$RequiredFiles = @(
    'docs/PAUTA-TV-APK-HANDOFF-20261109.md',
    'docs/PROMPT-CLAUDE-APK-PAUTA-TV-20261109.md',
    'apps/sistema/src/app/tv/pauta/page.tsx',
    'apps/sistema/src/features/pauta-tv/PautaTvBoard.tsx',
    'supabase/migrations/20261122290000_coverage_team_agenda_pauta.sql'
)

function Invoke-GitChecked {
    param([Parameter(Mandatory=$true)][string[]]$Arguments)
    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git falhou (exit $LASTEXITCODE): git $($Arguments -join ' ')"
    }
}

try {
    $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    Set-Location -LiteralPath $Root
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'Git nao encontrado no PATH. Abra a pasta do monorepo no VS Code com Git instalado.'
    }
    $ActualRoot = (& git rev-parse --show-toplevel 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $ActualRoot) {
        throw 'Esta pasta nao e um repositorio Git. Execute o PS1 dentro do monorepo.'
    }
    if ([IO.Path]::GetFullPath($ActualRoot) -ne [IO.Path]::GetFullPath($Root)) {
        throw "O script precisa estar no diretorio raiz correto: $ActualRoot"
    }

    Write-Host "Repositorio local: $Root" -ForegroundColor Cyan
    $Origin = (& git remote get-url origin).Trim()
    if ($LASTEXITCODE -ne 0 -or $Origin -notmatch '(?i)(github\.com[:/])altnixtecnologia/jornalir(\.git)?$') {
        throw "Origin inesperado: $Origin. Esperado: github.com/$ExpectedRepo"
    }

    Write-Host 'Verificando alteracoes locais e worktrees...' -ForegroundColor Cyan
    Invoke-GitChecked @('worktree','list')
    $Changes = @(& git status --porcelain=v1 --untracked-files=normal)
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel consultar git status.' }
    if ($Changes.Count -gt 0) {
        Write-Host 'Ha arquivos alterados ou nao rastreados. Nenhum arquivo sera descartado:' -ForegroundColor Yellow
        $Changes | ForEach-Object { Write-Host $_ }
        throw 'Sincronizacao interrompida. Revise/guarde as alteracoes com seguranca e rode novamente.'
    }

    Write-Host 'Buscando atualizacoes no GitHub (git fetch)...' -ForegroundColor Cyan
    Invoke-GitChecked @('fetch','origin','--prune')
    & git show-ref --verify --quiet ("refs/remotes/origin/" + $TargetBranch)
    if ($LASTEXITCODE -ne 0) {
        throw "Branch remota nao encontrada: origin/$TargetBranch"
    }
    $Current = (& git branch --show-current).Trim()
    if ($Current -ne $TargetBranch) {
        & git show-ref --verify --quiet ("refs/heads/" + $TargetBranch)
        $LocalExists = $LASTEXITCODE -eq 0
        Write-Host "Branch atual: $Current. Abrindo $TargetBranch..." -ForegroundColor Cyan
        if ($LocalExists) {
            Invoke-GitChecked @('switch',$TargetBranch)
        } else {
            Invoke-GitChecked @('switch','--track','-c',$TargetBranch,("origin/" + $TargetBranch))
        }
    }

    Write-Host 'Aplicando SOMENTE fast-forward seguro...' -ForegroundColor Cyan
    Invoke-GitChecked @('merge','--ff-only',("origin/" + $TargetBranch))
    $After = (& git status --porcelain=v1 --untracked-files=normal)
    if ($LASTEXITCODE -ne 0 -or $After) { throw 'Estado local inesperado apos a sincronizacao.' }
    $Commit = (& git rev-parse HEAD).Trim()
    Write-Host "Sincronizado: $Commit" -ForegroundColor Green

    foreach ($Required in $RequiredFiles) {
        $Full = Join-Path $Root $Required
        if (-not (Test-Path -LiteralPath $Full -PathType Leaf)) {
            throw "Arquivo esperado nao encontrado apos o fetch: $Required"
        }
    }

    if ($OpenVSCode) {
        $Code = Get-Command code -ErrorAction SilentlyContinue
        if ($null -ne $Code) { & code -r $Root }
        else { Write-Warning 'VS Code (comando code) nao esta no PATH. Abra a pasta manualmente.' }
    }

    $PromptPath = Join-Path $Root 'docs/PROMPT-CLAUDE-APK-PAUTA-TV-20261109.md'
    Write-Host ''
    Write-Host 'Preparacao concluida. Claude deve ler:' -ForegroundColor Green
    Write-Host $PromptPath -ForegroundColor White
    Write-Host 'Pagina web (apos deploy): https://controle.altnix.com.br/tv/pauta'
    Write-Host 'Este script NAO instala o APK e NAO altera o Supabase/Vercel.' -ForegroundColor DarkYellow

    if ($StartClaude) {
        if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
            throw 'CLI da Claude nao encontrada. Abra Claude Code no VS Code e mande ler o prompt acima.'
        }
        $Intro = 'Sincronizacao Git ja concluida pelo PS1. Leia e execute integralmente o arquivo ' +
            'docs/PROMPT-CLAUDE-APK-PAUTA-TV-20261109.md. Nao rode o PS1 novamente dentro da sua sessao.' 
        & claude $Intro
        if ($LASTEXITCODE -ne 0) { throw "Claude encerrou com codigo $LASTEXITCODE" }
    }
} catch {
    Write-Error $_
    exit 1
}
