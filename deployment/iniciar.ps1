# Arvoredo PDV - Script de Inicializacao
# Use este script para iniciar o sistema diariamente

param(
    [string]$PgPassword = "",
    [switch]$SkipBrowser
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ScriptDir).Parent.FullName

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Arvoredo PDV - Iniciando Sistema" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Configurar DATABASE_URL se nao existir
if ([string]::IsNullOrEmpty($env:DATABASE_URL)) {
    if ([string]::IsNullOrEmpty($PgPassword)) {
        Write-Host "ERRO: Defina a variavel DATABASE_URL ou passe -PgPassword" -ForegroundColor Red
        Write-Host ""
        Write-Host '  .\iniciar.ps1 -PgPassword "SUASENHA"' -ForegroundColor Yellow
        exit 1
    }
    $env:DATABASE_URL = "postgresql://postgres:${PgPassword}@localhost:5432/arvoredo"
}

# Parar processos anteriores se existirem
Write-Host "[1/5] Verificando processos anteriores..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*api-server*" -or $_.CommandLine -like "*vite*"
}
if ($nodeProcesses) {
    Write-Host "      Parando processos anteriores..." -ForegroundColor Yellow
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Verificar PostgreSQL
Write-Host "[2/5] Verificando PostgreSQL..." -ForegroundColor Yellow
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }
if (-not $pgService) {
    Write-Host "      PostgreSQL nao esta rodando. Tentando iniciar..." -ForegroundColor Yellow
    try {
        Start-Service -Name "postgresql-x64-18" -ErrorAction Stop
        Write-Host "      PostgreSQL iniciado!" -ForegroundColor Green
    } catch {
        Write-Host "      ERRO: Nao foi possivel iniciar o PostgreSQL" -ForegroundColor Red
        Write-Host "      Inicie manualmente pelo Gerenciador de Servicos" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "      PostgreSQL OK" -ForegroundColor Green
}

# Criar pasta de logs se nao existir
$logsDir = Join-Path $ProjectRoot "Logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

# Iniciar API em background
Write-Host "[3/5] Iniciando API (porta 8080)..." -ForegroundColor Yellow
$apiLog = Join-Path $logsDir "api-$(Get-Date -Format yyyyMMdd-HHmmss).log"

$env:PORT = "8080"

$apiJob = Start-Job -ScriptBlock {
    param($WorkDir, $LogFile, $DbUrl, $Port)
    $env:DATABASE_URL = $DbUrl
    $env:PORT = $Port
    Set-Location $WorkDir
    pnpm --filter @workspace/api-server run dev 2>&1 | Tee-Object -FilePath $LogFile
} -ArgumentList $ProjectRoot, $apiLog, $env:DATABASE_URL, $env:PORT

Write-Host "      API iniciando em background..." -ForegroundColor Cyan
Write-Host "      Log: $apiLog" -ForegroundColor Gray

# Aguardar API iniciar
Write-Host "[4/5] Aguardando API ficar pronta..." -ForegroundColor Yellow
$maxWait = 30
$waited = 0
$apiReady = $false

while ($waited -lt $maxWait) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/api/healthz" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $apiReady = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 1
    $waited++
    Write-Host -NoNewline "`r      Aguardando... $waited/$maxWait s" -ForegroundColor Gray
}

if ($apiReady) {
    Write-Host "`r      API pronta! (${waited}s)" -ForegroundColor Green
} else {
    Write-Host "`r      AVISO: API pode estar iniciando ainda..." -ForegroundColor Yellow
}

# Iniciar Frontend
Write-Host "[5/5] Iniciando Frontend (porta 5173)..." -ForegroundColor Yellow
$frontendLog = Join-Path $logsDir "frontend-$(Get-Date -Format yyyyMMdd-HHmmss).log"

$frontendJob = Start-Job -ScriptBlock {
    param($WorkDir, $LogFile, $DbUrl)
    $env:DATABASE_URL = $DbUrl
    Set-Location $WorkDir
    pnpm --filter @workspace/arvoredo run dev 2>&1 | Tee-Object -FilePath $LogFile
} -ArgumentList $ProjectRoot, $frontendLog, $env:DATABASE_URL

Write-Host "      Frontend iniciando em background..." -ForegroundColor Cyan
Write-Host "      Log: $frontendLog" -ForegroundColor Gray

# Aguardar Frontend iniciar
Write-Host "      Aguardando Frontend..." -ForegroundColor Yellow
$maxWait = 20
$waited = 0

while ($waited -lt $maxWait) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            break
        }
    } catch { }
    Start-Sleep -Seconds 1
    $waited++
}

Write-Host "      Frontend pronto!" -ForegroundColor Green

# Abrir navegador
if (-not $SkipBrowser) {
    Write-Host ""
    Write-Host "Abrindo navegador..." -ForegroundColor Cyan
    Start-Process "http://localhost:5173"
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Sistema Arvoredo PDV Online!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  - Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  - API:      http://localhost:8080/api/healthz" -ForegroundColor White
Write-Host ""
Write-Host "Pressione Ctrl+C para parar o sistema" -ForegroundColor Yellow
Write-Host ""

# Manter script rodando
try {
    while ($true) {
        Start-Sleep -Seconds 5
        
        # Verificar se API ainda esta rodando
        try {
            Invoke-WebRequest -Uri "http://localhost:8080/api/healthz" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
        } catch {
            Write-Host ""
            Write-Host "AVISO: API parece ter parado. Verifique os logs." -ForegroundColor Yellow
        }
    }
} finally {
    Write-Host ""
    Write-Host "Parando sistema..." -ForegroundColor Yellow
    Stop-Job -Job $apiJob -ErrorAction SilentlyContinue
    Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    Write-Host "Sistema parado." -ForegroundColor Green
}
