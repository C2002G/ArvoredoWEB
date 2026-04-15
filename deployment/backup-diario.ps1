# Arvoredo PDV - Backup diario
# Use no Agendador de Tarefas para executar 1x por dia.

param(
    [string]$PgPassword = "",
    [string]$ProjectRoot = "C:\Arvoredo"
)

$ErrorActionPreference = "Stop"

$BackupDir = Join-Path $ProjectRoot "Backups"
$BackupScript = Join-Path $ProjectRoot "deployment\backup-excel.ps1"

if (-not (Test-Path $BackupScript)) {
    Write-Host "ERRO: script de backup nao encontrado em $BackupScript" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

# Evita gerar dois backups no mesmo dia.
$today = Get-Date -Format "yyyy-MM-dd"
$existing = Get-ChildItem -Path $BackupDir -Filter "Arvoredo_Backup_${today}_*.xlsx" -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Backup de hoje ja existe. Nada a fazer." -ForegroundColor Yellow
    exit 0
}

Set-Location $ProjectRoot

if ([string]::IsNullOrEmpty($PgPassword)) {
    & powershell -ExecutionPolicy Bypass -File $BackupScript -Data (Get-Date) -OutputDir $BackupDir
} else {
    & powershell -ExecutionPolicy Bypass -File $BackupScript -PgPassword $PgPassword -Data (Get-Date) -OutputDir $BackupDir
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: backup diario falhou" -ForegroundColor Red
    exit 1
}

# Mantem somente 30 dias.
$cutoffDate = (Get-Date).AddDays(-30)
Get-ChildItem -Path $BackupDir -Filter "Arvoredo_Backup_*.xlsx" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoffDate } |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "Backup diario concluido com sucesso." -ForegroundColor Green
