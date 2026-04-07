# Arvoredo PDV - Script de Primeira Instalacao Completa
# Use este script para configurar TUDO do zero (1x so)

param(
    [string]$PgPassword = "",
    [string]$GitUrl = "https://github.com/C2002G/ArvoredoWEB.git"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Arvoredo PDV - Instalacao Completa" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$InstallPath = "C:\Arvoredo"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Se chamado de outro local, ajustar caminhos
if ($ScriptDir -notlike "*deployment*") {
    $ScriptDir = Join-Path $InstallPath "deployment"
}

Write-Host "[1/8] Verificando instalacao..." -ForegroundColor Yellow

# Verificar se ja esta instalado
if (Test-Path $InstallPath) {
    Write-Host "      Diretorio ja existe: $InstallPath" -ForegroundColor Yellow
    $alreadyInstalled = $true
} else {
    $alreadyInstalled = $false
}

# 1. Se nao esta instalado, clonar
if (-not $alreadyInstalled) {
    Write-Host "[2/8] Clonando repositorio..." -ForegroundColor Yellow
    Write-Host "      URL: $GitUrl" -ForegroundColor Gray
    Write-Host "      Destino: $InstallPath" -ForegroundColor Gray
    
    try {
        git clone $GitUrl $InstallPath 2>&1
        if ($LASTEXITCODE -ne 0) { throw "git clone falhou" }
        Write-Host "      Repositorio clonado!" -ForegroundColor Green
    } catch {
        Write-Host "      ERRO ao clonar repositorio" -ForegroundColor Red
        Write-Host "      Verifique se Git esta instalado e a URL esta correta" -ForegroundColor Yellow
        exit 1
    }
}

# 2. Entrar no diretorio
Set-Location $InstallPath
$ScriptDir = Join-Path $InstallPath "deployment"

Write-Host "[3/8] Verificando Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node -v
    Write-Host "      Node.js $nodeVersion OK" -ForegroundColor Green
} catch {
    Write-Host "      ERRO: Node.js nao instalado" -ForegroundColor Red
    Write-Host "      Baixe em: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

Write-Host "[4/8] Verificando pnpm..." -ForegroundColor Yellow
try {
    pnpm -v 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "" }
    Write-Host "      pnpm OK" -ForegroundColor Green
} catch {
    Write-Host "      Instalando pnpm..." -ForegroundColor Yellow
    npm install -g pnpm
}

Write-Host "[5/8] Instalando dependencias..." -ForegroundColor Yellow
pnpm install 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERRO ao instalar dependencias" -ForegroundColor Red
    exit 1
}
Write-Host "      Dependencias OK" -ForegroundColor Green

# Instalar dependencias extras
Write-Host "[6/8] Instalando dependencias extras (xlsx, pg)..." -ForegroundColor Yellow
npm install xlsx pg 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "      xlsx e pg OK" -ForegroundColor Green
} else {
    Write-Host "      AVISO: Erro ao instalar xlsx/pg" -ForegroundColor Yellow
}

# 7. Configurar .env
if ([string]::IsNullOrEmpty($PgPassword)) {
    Write-Host "[7/8] Configurando .env..." -ForegroundColor Yellow
    Write-Host "      Digite a senha do PostgreSQL: " -NoNewline -ForegroundColor Cyan
    $PgPassword = Read-Host -AsSecureString
    $PgPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($PgPassword))
}

$envFile = Join-Path $InstallPath ".env"
$envContent = "DATABASE_URL=postgresql://postgres:${PgPassword}@localhost:5432/arvoredo`nPORT=8080`n"
$envContent | Out-File -FilePath $envFile -Encoding UTF8
Write-Host "      .env configurado!" -ForegroundColor Green

# 8. Criar banco de dados
Write-Host "[8/8] Verificando banco de dados..." -ForegroundColor Yellow
$env:DATABASE_URL = "postgresql://postgres:${PgPassword}@localhost:5432/arvoredo"

try {
    pnpm --filter @workspace/db run push 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Banco de dados OK!" -ForegroundColor Green
    } else {
        Write-Host "      AVISO: Verifique se o banco 'arvoredo' existe no pgAdmin" -ForegroundColor Yellow
    }
} catch {
    Write-Host "      AVISO: Verifique se PostgreSQL esta rodando" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Instalacao concluida!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Resumo:" -ForegroundColor White
Write-Host "  - Sistema instalado em: $InstallPath" -ForegroundColor Gray
Write-Host "  - Arquivo .env configurado" -ForegroundColor Gray
Write-Host "  - Dependencias instaladas" -ForegroundColor Gray
Write-Host ""
Write-Host "Proximo passo:" -ForegroundColor White
Write-Host "  cd $InstallPath" -ForegroundColor Gray
Write-Host "  .\deployment\iniciar.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "Para abrir o sistema no futuro:" -ForegroundColor White
Write-Host "  .\deployment\iniciar.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "Para fazer backup:" -ForegroundColor White
Write-Host "  .\deployment\backup-excel.ps1 -OpenAfter" -ForegroundColor Gray
Write-Host ""
