# deployment/backup-cloud.ps1
# Arvoredo PDV - Backup tecnico (pg_dump) + envio para nuvem do cliente (rclone)
# Complementa o backup-excel.ps1 (que gera relatorio local, nao muda).
# Uso: powershell -ExecutionPolicy Bypass -File .\deployment\backup-cloud.ps1

param(
    [string]$PgPassword = "1234",
    [string]$ProjectRoot = "C:\Arvoredo",
    [string]$RcloneRemote = "gdrive-cliente",      # nome configurado via 'rclone config'
    [string]$RemoteFolder = "ArvoredoBackups",
    [string]$DbName = "arvoredo",
    [string]$DbUser = "postgres",
    [int]$RetencaoDiasLocal = 7,
    [int]$RetencaoDiasNuvem = 180
)

$ErrorActionPreference = "Stop"

# Le a senha do .env se nao foi passada por parametro (mesmo padrao do backup-diario.ps1)
$envFile = Join-Path $ProjectRoot ".env"
if ([string]::IsNullOrEmpty($PgPassword) -and (Test-Path $envFile)) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match 'DATABASE_URL=.*://([^:]+):([^@]+)@') {
        $DbUser = $matches[1]
        $PgPassword = $matches[2]
    }
}

if ([string]::IsNullOrEmpty($PgPassword)) {
    Write-Host "ERRO: senha do PostgreSQL nao encontrada (parametro ou .env)" -ForegroundColor Red
    exit 1
}

$env:PGPASSWORD = $PgPassword

$BackupDir = Join-Path $ProjectRoot "Backups\DB"
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$dumpFile = Join-Path $BackupDir "arvoredo_$timestamp.dump"

Write-Host "Gerando dump do PostgreSQL..." -ForegroundColor Yellow
& pg_dump -U $DbUser -h localhost -p 5432 -Fc -f $dumpFile $DbName

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dumpFile)) {
    Write-Host "ERRO: pg_dump falhou. Verifique se pg_dump esta no PATH." -ForegroundColor Red
    exit 1
}
Write-Host "Dump gerado: $dumpFile" -ForegroundColor Green

# Envio para a nuvem do cliente
$rcloneExe = Join-Path $ProjectRoot "deployment\tools\rclone.exe"
if (-not (Test-Path $rcloneExe)) { $rcloneExe = "rclone" }  # tenta PATH se nao achar local

Write-Host "Enviando para nuvem ($RcloneRemote)..." -ForegroundColor Yellow
& $rcloneExe copy $dumpFile "${RcloneRemote}:${RemoteFolder}" --quiet

if ($LASTEXITCODE -ne 0) {
    Write-Host "AVISO: envio para nuvem falhou. Dump local foi mantido." -ForegroundColor Yellow
} else {
    Write-Host "Backup enviado para nuvem com sucesso." -ForegroundColor Green

    # 'Reciclagem': apaga na nuvem o que passou da retencao (mantem local mais curto, nuvem mais longa)
    & $rcloneExe delete "${RcloneRemote}:${RemoteFolder}" --min-age "${RetencaoDiasNuvem}d" --quiet
}

# Limpeza local (mantem poucos dias - a nuvem e' a copia de verdade)
$cutoffLocal = (Get-Date).AddDays(-$RetencaoDiasLocal)
Get-ChildItem -Path $BackupDir -Filter "arvoredo_*.dump" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoffLocal } |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "Backup em nuvem concluido." -ForegroundColor Green