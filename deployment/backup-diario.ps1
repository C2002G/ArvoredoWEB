# Arvoredo PDV - Backup Diario Agendado
# Crie uma tarefa no Agendador de Tarefas do Windows para rodar diariamente

# Instrucoes:
# 1. Abra o Agendador de Tarefas (Task Scheduler)
# 2. Crie uma Tarefa Basica
# 3. Nome: Arvoredo_Backup_Diario
# 4. Disparo: Todo dia as 22:00
# 5. Acao: Iniciar um programa
# 6. Programa: powershell.exe
# 7. Argumentos: -ExecutionPolicy Bypass -File "C:\Arvoredo\deployment\backup-diario.ps1"

param(
    [string]$PgPassword = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Arvoredo"
$BackupDir = Join-Path $ProjectRoot "Backups"

# Criar diretorio de backup se nao existir
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

# Se nao passou senha, tentar ler do .env
if ([string]::IsNullOrEmpty($PgPassword)) {
    $envFile = Join-Path $ProjectRoot ".env"
    if (Test-Path $envFile) {
        $envContent = Get-Content $envFile -Raw
        if ($envContent -match "DATABASE_URL=.*:([^@]+)@") {
            $PgPassword = $Matches[1]
        }
    }
}

if ([string]::IsNullOrEmpty($PgPassword)) {
    Write-Host "ERRO: Senha do PostgreSQL nao encontrada" -ForegroundColor Red
    Write-Host "Configure o arquivo .env ou passe -PgPassword" -ForegroundColor Yellow
    exit 1
}

# Data do backup
$dateStr = Get-Date -Format "yyyy-MM-dd"
$fileName = "Arvoredo_Backup_${dateStr}.xlsx"
$outputPath = Join-Path $BackupDir $fileName

# Verificar se ja existe backup de hoje
if (Test-Path $outputPath) {
    Write-Host "Backup de hoje ja existe: $fileName" -ForegroundColor Yellow
    exit 0
}

# Gerar backup
Write-Host "Gerando backup: $dateStr" -ForegroundColor Cyan
Set-Location $ProjectRoot

try {
    node backup_temp.js 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Erro na geracao"
    }
    Write-Host "Backup gerado: $fileName" -ForegroundColor Green
} catch {
    Write-Host "ERRO: $_" -ForegroundColor Red
    exit 1
}

# Manter apenas os ultimos 30 dias
$cutoffDate = (Get-Date).AddDays(-30)
Get-ChildItem -Path $BackupDir -Filter "Arvoredo_Backup_*.xlsx" | 
    Where-Object { $_.LastWriteTime -lt $cutoffDate } |
    Remove-Item -Force

Write-Host "Backup diario concluido!" -ForegroundColor Green
