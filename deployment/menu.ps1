# Arvoredo PDV - Menu Interativo

param(
    [switch]$SkipPassword
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ProjectRoot).Parent.FullName

Set-Location $ProjectRoot

# Load password from .env
$PgPassword = $null
$envFile = Join-Path $ProjectRoot ".env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "postgres:([^@]+)@") {
        $PgPassword = $Matches[1]
    }
}

if ([string]::IsNullOrEmpty($PgPassword) -and -not $SkipPassword) {
    Write-Host "Digite a senha do PostgreSQL: " -NoNewline -ForegroundColor Cyan
    $input = Read-Host
    if (-not [string]::IsNullOrEmpty($input)) {
        $PgPassword = $input
    }
}

function Show-Menu {
    Clear-Host
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "       Arvoredo PDV - Menu" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1. Iniciar Sistema" -ForegroundColor White
    Write-Host "  2. Parar Sistema" -ForegroundColor White
    Write-Host "  3. Fazer Backup Excel" -ForegroundColor White
    Write-Host "  4. Atualizar Sistema (Git)" -ForegroundColor White
    Write-Host "  5. Verificar Status" -ForegroundColor White
    Write-Host ""
    Write-Host "  0. Sair" -ForegroundColor Gray
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
}

function Start-System {
    Write-Host ""
    Write-Host "[1/3] Verificando PostgreSQL..." -ForegroundColor Yellow
    
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }
    if (-not $pgService) {
        Write-Host "      PostgreSQL nao esta rodando. Iniciando..." -ForegroundColor Yellow
        try {
            Start-Service -Name "postgresql-x64-18" -ErrorAction Stop
            Write-Host "      PostgreSQL iniciado!" -ForegroundColor Green
        } catch {
            Write-Host "      ERRO: Nao foi possivel iniciar PostgreSQL" -ForegroundColor Red
            Read-Host "Pressione Enter para continuar"
            return
        }
    } else {
        Write-Host "      PostgreSQL OK" -ForegroundColor Green
    }

    Write-Host "[2/3] Parando processos antigos..." -ForegroundColor Yellow
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    Write-Host "[3/3] Iniciando API e Frontend..." -ForegroundColor Yellow
    
    if (-not [string]::IsNullOrEmpty($PgPassword)) {
        $env:DATABASE_URL = "postgresql://postgres:${PgPassword}@localhost:5432/arvoredo"
    }
    $env:PORT = "8080"

    Start-Job -ScriptBlock {
        param($WorkDir, $DbUrl, $Port)
        $env:DATABASE_URL = $DbUrl
        $env:PORT = $Port
        Set-Location $WorkDir
        pnpm --filter @workspace/api-server run dev
    } -ArgumentList $ProjectRoot, $env:DATABASE_URL, $env:PORT | Out-Null

    Start-Sleep -Seconds 3

    Start-Job -ScriptBlock {
        param($WorkDir, $DbUrl)
        $env:DATABASE_URL = $DbUrl
        $env:PORT = "5173"
        Set-Location $WorkDir
        pnpm --filter @workspace/arvoredo run dev
    } -ArgumentList $ProjectRoot, $env:DATABASE_URL | Out-Null

    Write-Host ""
    Write-Host "Sistema iniciando..." -ForegroundColor Cyan
    Write-Host "Aguarde 5 segundos e abra: http://localhost:5173" -ForegroundColor Gray
    
    Start-Sleep -Seconds 5
    Start-Process "http://localhost:5173"
    
    Write-Host ""
    Write-Host "Sistema iniciado!" -ForegroundColor Green
}

function Stop-System {
    Write-Host ""
    Write-Host "Parando processos..." -ForegroundColor Yellow
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    Write-Host "Sistema parado!" -ForegroundColor Green
}

function Backup-Excel {
    Write-Host ""
    Write-Host "Gerando backup Excel..." -ForegroundColor Yellow
    
    $backupScript = Join-Path $ProjectRoot "deployment\backup-excel.ps1"
    if (Test-Path $backupScript) {
        if (-not [string]::IsNullOrEmpty($PgPassword)) {
            & powershell -ExecutionPolicy Bypass -File $backupScript -PgPassword $PgPassword -OpenAfter
        } else {
            & powershell -ExecutionPolicy Bypass -File $backupScript -OpenAfter
        }
    } else {
        Write-Host "ERRO: Script de backup nao encontrado" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "Backup concluido!" -ForegroundColor Green
}

function Update-System {
    Write-Host ""
    Write-Host "Atualizando sistema..." -ForegroundColor Yellow

    $branch = git branch --show-current
    if ([string]::IsNullOrEmpty($branch)) {
        $branch = "main"
    }

    git pull origin $branch 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Sistema atualizado!" -ForegroundColor Green
    } else {
        Write-Host "ERRO na atualizacao" -ForegroundColor Red
    }
}

function Check-Status {
    Write-Host ""
    Write-Host "Verificando servicos..." -ForegroundColor Yellow
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/api/healthz" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "  API (8080): ONLINE" -ForegroundColor Green
        }
    } catch {
        Write-Host "  API (8080): OFFLINE" -ForegroundColor Red
    }
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "  Frontend (5173): ONLINE" -ForegroundColor Green
        }
    } catch {
        Write-Host "  Frontend (5173): OFFLINE" -ForegroundColor Red
    }
    
    Write-Host ""
}

# Main loop
do {
    Show-Menu
    $choice = Read-Host "Escolha uma opcao"
    
    switch ($choice) {
        "1" { Start-System; Read-Host "Pressione Enter para continuar" }
        "2" { Stop-System; Read-Host "Pressione Enter para continuar" }
        "3" { Backup-Excel; Read-Host "Pressione Enter para continuar" }
        "4" { Update-System; Read-Host "Pressione Enter para continuar" }
        "5" { Check-Status; Read-Host "Pressione Enter para continuar" }
        "0" { 
            Write-Host ""
            Write-Host "Ate mais!" -ForegroundColor Cyan
            break
        }
        default { 
            Write-Host "Opcao invalida!" -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
} while ($choice -ne "0")
