# Arvoredo PDV - Script para Parar o Sistema
# Use este script para parar API e Frontend

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ScriptDir).Parent.FullName

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Arvoredo PDV - Parando Sistema" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Encontrar processos node relacionados ao Arvoredo
Write-Host "[1/2] Identificando processos..." -ForegroundColor Yellow
$nodeProcesses = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -like "*api-server*" -or 
    $_.CommandLine -like "*arvoredo*" -or 
    $_.CommandLine -like "*vite*"
} -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    $count = $nodeProcesses.Count
    Write-Host "      Encontrados $count processo(s)" -ForegroundColor Yellow
    
    Write-Host "[2/2] Parando processos..." -ForegroundColor Yellow
    foreach ($proc in $nodeProcesses) {
        $pid = $proc.ProcessId
        $name = $proc.Name
        try {
            Stop-Process -Id $pid -Force -ErrorAction Stop
            Write-Host "      PID $pid parado" -ForegroundColor Green
        } catch {
            Write-Host "      PID $pid nao pode ser parado (pode ja ter parado)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "      Nenhum processo do Arvoredo encontrado" -ForegroundColor Yellow
    Write-Host "[2/2] Verificando portas..." -ForegroundColor Yellow
    
    # Verificar se as portas ainda estao em uso
    $apiPort = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
    $frontendPort = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
    
    if ($apiPort -or $frontendPort) {
        Write-Host "      AVISO: Portas ainda em uso" -ForegroundColor Yellow
        if ($apiPort) { Write-Host "      Porta 8080 (API) em uso" -ForegroundColor Gray }
        if ($frontendPort) { Write-Host "      Porta 5173 (Frontend) em uso" -ForegroundColor Gray }
        Write-Host "      Tentando forcar parada..." -ForegroundColor Yellow
        
        Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    } else {
        Write-Host "      Portas 8080 e 5173 livres" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Sistema parado!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
