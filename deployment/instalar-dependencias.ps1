# Arvoredo PDV - Instalar Dependencias
# Execute este script para instalar as dependencias necessarias para os scripts

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Arvoredo PDV - Instalando Dependencias" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ProjectRoot).Parent.FullName

Set-Location $ProjectRoot

# Verificar Node.js
Write-Host "[1/4] Verificando Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node -v
    Write-Host "      Node.js $nodeVersion OK" -ForegroundColor Green
} catch {
    Write-Host "      ERRO: Node.js nao instalado" -ForegroundColor Red
    Write-Host "      Baixe em: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Verificar pnpm
Write-Host "[2/4] Verificando pnpm..." -ForegroundColor Yellow
try {
    $pnpmVersion = pnpm -v 2>&1
    if ($LASTEXITCODE -ne 0) { throw "pnpm nao encontrado" }
    Write-Host "      pnpm $pnpmVersion OK" -ForegroundColor Green
} catch {
    Write-Host "      Instalando pnpm..." -ForegroundColor Yellow
    npm install -g pnpm
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      ERRO ao instalar pnpm" -ForegroundColor Red
        exit 1
    }
    Write-Host "      pnpm OK" -ForegroundColor Green
}

# Instalar dependencias do projeto
Write-Host "[3/4] Instalando dependencias do projeto..." -ForegroundColor Yellow
pnpm install 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERRO ao instalar dependencias" -ForegroundColor Red
    exit 1
}
Write-Host "      Dependencias OK" -ForegroundColor Green

# Instalar dependencias extras para backup Excel (workspace root)
Write-Host "[4/4] Instalando dependencias extras (xlsx, pg)..." -ForegroundColor Yellow
pnpm add -w xlsx pg 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "      AVISO: Erro ao instalar xlsx/pg" -ForegroundColor Yellow
    Write-Host "      O backup Excel pode nao funcionar" -ForegroundColor Yellow
} else {
    Write-Host "      xlsx e pg OK" -ForegroundColor Green
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Instalacao concluida!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Agora voce pode:" -ForegroundColor White
Write-Host "  1. Copie .env.example para .env e configure a senha" -ForegroundColor Gray
Write-Host "  2. Execute .\configurar-sistema.ps1 (1x so)" -ForegroundColor Gray
Write-Host "  3. Execute .\iniciar.ps1 para abrir o sistema" -ForegroundColor Gray
Write-Host ""
