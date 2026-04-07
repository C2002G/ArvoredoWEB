# Arvoredo PDV - Script de Atualizacao
# Execute este script para atualizar o sistema via Git

param(
    [string]$PgPassword = "",
    [switch]$ForceRebuild
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ScriptDir).Parent.FullName

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Arvoredo PDV - Atualizando Sistema" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se e um repositorio git
if (-not (Test-Path (Join-Path $ProjectRoot ".git"))) {
    Write-Host "ERRO: Este diretorio nao e um repositorio Git" -ForegroundColor Red
    Write-Host "O sistema deve ter sido clonado via Git para funcionar" -ForegroundColor Yellow
    exit 1
}

# Configurar DATABASE_URL se necessario
if ([string]::IsNullOrEmpty($env:DATABASE_URL)) {
    if ([string]::IsNullOrEmpty($PgPassword)) {
        Write-Host "Digite a senha do PostgreSQL: " -NoNewline -ForegroundColor Yellow
        $PgPassword = Read-Host -AsSecureString
        $PgPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($PgPassword))
    }
    $env:DATABASE_URL = "postgresql://postgres:${PgPassword}@localhost:5432/arvoredo"
}

# 1. Verificar conexao com Git remote
Write-Host "[1/6] Verificando conexao com Git..." -ForegroundColor Yellow
Set-Location $ProjectRoot
git remote -v | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERRO: Problema com repositorio Git" -ForegroundColor Red
    exit 1
}
Write-Host "      Git OK" -ForegroundColor Green

# 2. Buscar atualizacoes
Write-Host "[2/6] Buscando atualizacoes..." -ForegroundColor Yellow
git fetch origin 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "      AVISO: Nao foi possivel buscar atualizacoes (verifique internet)" -ForegroundColor Yellow
} else {
    Write-Host "      Busca OK" -ForegroundColor Green
}

# 3. Verificar se ha atualizacoes
Write-Host "[3/6] Verificando atualizacoes..." -ForegroundColor Yellow
$localCommit = git rev-parse HEAD
$remoteCommit = git rev-parse origin/master

if ($localCommit -eq $remoteCommit) {
    Write-Host "      Sistema ja esta na versao mais recente" -ForegroundColor Green
    $hasUpdates = $false
} else {
    Write-Host "      Ha atualizacoes disponiveis!" -ForegroundColor Green
    $hasUpdates = $true
}

# 4. Pull se houver atualizacoes
if ($hasUpdates) {
    Write-Host "[4/6] Baixando atualizacoes..." -ForegroundColor Yellow
    git pull origin master 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      ERRO no git pull. Voce pode ter mudancas locais." -ForegroundColor Red
        Write-Host "      Use 'git status' para ver conflitos" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "      Atualizacoes baixadas!" -ForegroundColor Green
}

# 5. Reinstalar dependencias se necessario
Write-Host "[5/6] Verificando dependencias..." -ForegroundColor Yellow
$needInstall = $false
if ($hasUpdates) {
    # Verificar se package.json foi alterado
    git diff HEAD~1 --name-only | ForEach-Object {
        if ($_ -match "package\.json$") { $needInstall = $true }
    }
}

if ($needInstall -or $ForceRebuild) {
    Write-Host "      Reinstalando dependencias..." -ForegroundColor Yellow
    pnpm install 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      ERRO na instalacao de dependencias" -ForegroundColor Red
        exit 1
    }
    Write-Host "      Dependencias OK" -ForegroundColor Green
} else {
    Write-Host "      Dependencias OK" -ForegroundColor Green
}

# 6. Rebuild se necessario
if ($hasUpdates -or $ForceRebuild) {
    Write-Host "[6/6] Rebuild do sistema..." -ForegroundColor Yellow
    
    # Parar processos antigos
    Write-Host "      Parando processos antigos..." -ForegroundColor Gray
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    
    # Rebuild
    pnpm run build 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      ERRO no build. Verifique o log acima." -ForegroundColor Red
        exit 1
    }
    Write-Host "      Build OK" -ForegroundColor Green
} else {
    Write-Host "[6/6] Build nao necessario (sem atualizacoes)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Atualizacao concluida!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Inicie o sistema com: .\iniciar.ps1" -ForegroundColor Cyan
Write-Host ""
