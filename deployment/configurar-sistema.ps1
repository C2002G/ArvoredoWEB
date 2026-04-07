# Arvoredo PDV - Script de Configuração (1ª vez)
# Execute este script APENAS uma vez para configurar o banco de dados
# Depois use: .\iniciar.ps1

param(
    [string]$PgUser = "postgres",
    [string]$PgPassword = "",
    [string]$DbName = "arvoredo"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Arvoredo PDV - Configuração Inicial" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se DATABASE_URL está configurada
if ([string]::IsNullOrEmpty($env:DATABASE_URL)) {
    if ([string]::IsNullOrEmpty($PgPassword)) {
        Write-Host "ERRO: Defina a variavel DATABASE_URL ou passe a senha do PostgreSQL" -ForegroundColor Red
        Write-Host ""
        Write-Host "Opcao 1 - Defina variavel de ambiente:" -ForegroundColor Yellow
        Write-Host '  $env:DATABASE_URL = "postgresql://postgres:SUASENHA@localhost:5432/arvoredo"' -ForegroundColor Gray
        Write-Host ""
        Write-Host "Opcao 2 - Passe a senha como parametro:" -ForegroundColor Yellow
        Write-Host '  .\configurar-sistema.ps1 -PgPassword "SUASENHA"' -ForegroundColor Gray
        Write-Host ""
        exit 1
    }
    
    $env:DATABASE_URL = "postgresql://${PgUser}:${PgPassword}@localhost:5432/${DbName}"
}

Write-Host "[1/4] Verificando conexao com PostgreSQL..." -ForegroundColor Yellow
try {
    $testResult = & pnpm --filter @workspace/db run push 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Tabelas criadas com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "      ERRO ao criar tabelas" -ForegroundColor Red
        Write-Host $testResult -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "      ERRO de conexao com banco de dados" -ForegroundColor Red
    Write-Host "      Verifique se:" -ForegroundColor Yellow
    Write-Host "      - PostgreSQL esta instalado e rodando" -ForegroundColor Yellow
    Write-Host "      - DATABASE_URL esta correta" -ForegroundColor Yellow
    Write-Host "      - O banco '$DbName' existe no pgAdmin" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "[2/4] Verificando instalacao do pnpm..." -ForegroundColor Yellow
try {
    $pnpmVersion = pnpm -v 2>&1
    if ($LASTEXITCODE -ne 0) { throw "pnpm nao encontrado" }
    Write-Host "      pnpm v$pnpmVersion OK" -ForegroundColor Green
} catch {
    Write-Host "      ERRO: pnpm nao instalado" -ForegroundColor Red
    Write-Host "      Instale com: npm install -g pnpm" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "[3/4] Instalando dependencias do projeto..." -ForegroundColor Yellow
try {
    pnpm install 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Dependencias OK" -ForegroundColor Green
    } else {
        throw "Falha no pnpm install"
    }
} catch {
    Write-Host "      ERRO ao instalar dependencias" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[4/4] Verificando estrutura..." -ForegroundColor Yellow

$apiServer = Test-Path "artifacts/api-server"
$frontend = Test-Path "artifacts/arvoredo"

if (-not $apiServer) {
    Write-Host "      AVISO: artifacts/api-server nao encontrado" -ForegroundColor Yellow
}
if (-not $frontend) {
    Write-Host "      AVISO: artifacts/arvoredo nao encontrado" -ForegroundColor Yellow
}
if ($apiServer -and $frontend) {
    Write-Host "      Estrutura OK" -ForegroundColor Green
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Configuracao concluida!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proximo passo: Use .\iniciar.ps1 para iniciar o sistema" -ForegroundColor Cyan
Write-Host ""
