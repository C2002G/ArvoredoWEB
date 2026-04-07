# Arvoredo PDV - Script de Primeira Instalacao Completa
# Use este script para configurar TUDO do zero (1x so)
# 
# O que ele faz:
#   1. Clona o repositorio (se nao existir)
#   2. Instala pnpm
#   3. Instala dependencias
#   4. Cria banco de dados (se nao existir)
#   5. Cria tabelas no banco
#   6. Configura arquivo .env
#
# Pre-requisito: PostgreSQL ja instalado (pelo instalador padrao)

param(
    [string]$PgPassword = "",
    [string]$GitUrl = "https://github.com/C2002G/ArvoredoWEB.git",
    [string]$InstallPath = "C:\Arvoredo"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Arvoredo PDV - Instalacao Completa" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Se chamado de outro local, ajustar caminhos
if ($ScriptDir -notlike "*deployment*" -and (Test-Path $InstallPath)) {
    $ScriptDir = Join-Path $InstallPath "deployment"
}

# ============================================
# PASSO 1: Clonar repositorio
# ============================================
Write-Host "[1/9] Verificando repositorio..." -ForegroundColor Yellow

if (Test-Path $InstallPath) {
    Write-Host "      Repositorio ja existe: $InstallPath" -ForegroundColor Green
    $alreadyInstalled = $true
} else {
    Write-Host "      Clonando repositorio..." -ForegroundColor Yellow
    Write-Host "      URL: $GitUrl" -ForegroundColor Gray
    Write-Host "      Destino: $InstallPath" -ForegroundColor Gray
    
    try {
        git clone $GitUrl $InstallPath 2>&1
        if ($LASTEXITCODE -ne 0) { throw "git clone falhou" }
        Write-Host "      Repositorio clonado!" -ForegroundColor Green
        $alreadyInstalled = $false
    } catch {
        Write-Host "      ERRO ao clonar repositorio" -ForegroundColor Red
        Write-Host "      Verifique se Git esta instalado" -ForegroundColor Yellow
        exit 1
    }
}

Set-Location $InstallPath
$ScriptDir = Join-Path $InstallPath "deployment"

# ============================================
# PASSO 2: Verificar PostgreSQL
# ============================================
Write-Host ""
Write-Host "[2/9] Verificando PostgreSQL..." -ForegroundColor Yellow

# Verificar se psql esta disponivel
$psqlPath = $null
$pgVersion = $null

# Tentar encontrar psql
$psqlLocations = @(
    "C:\Program Files\PostgreSQL\18\bin\psql.exe",
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe",
    "psql.exe"  # Se estiver no PATH
)

foreach ($loc in $psqlLocations) {
    if (Test-Path $loc) {
        $psqlPath = $loc
        break
    }
}

if (-not $psqlPath) {
    # Tentar via Get-Command
    try {
        $psqlPath = (Get-Command psql -ErrorAction SilentlyContinue).Source
    } catch { }
}

if (-not $psqlPath) {
    Write-Host "      ERRO: PostgreSQL nao encontrado!" -ForegroundColor Red
    Write-Host "      Por favor, instale o PostgreSQL primeiro:" -ForegroundColor Yellow
    Write-Host "      1. Baixe em: https://www.postgresql.org/download/windows/" -ForegroundColor Gray
    Write-Host "      2. Execute o instalador e anote a senha do usuario 'postgres'" -ForegroundColor Gray
    Write-Host "      3. Apos instalar, execute este script novamente" -ForegroundColor Gray
    exit 1
}

Write-Host "      psql encontrado: $psqlPath" -ForegroundColor Green

# Verificar se PostgreSQL esta rodando
Write-Host "      Verificando se PostgreSQL esta rodando..." -ForegroundColor Yellow
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }

if (-not $pgService) {
    Write-Host "      PostgreSQL nao esta rodando. Tentando iniciar..." -ForegroundColor Yellow
    
    # Tentar iniciar o servico
    $serviceName = "postgresql-x64-18"
    if (-not (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
        $serviceName = "postgresql-x64-17"
    }
    if (-not (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
        $serviceName = "postgresql-x64-16"
    }
    
    try {
        Start-Service -Name $serviceName -ErrorAction Stop
        Write-Host "      PostgreSQL iniciado!" -ForegroundColor Green
        Start-Sleep -Seconds 2
    } catch {
        Write-Host "      ERRO: Nao foi possivel iniciar o PostgreSQL" -ForegroundColor Red
        Write-Host "      Inicie manualmente pelo Gerenciador de Servicos do Windows" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "      PostgreSQL esta rodando" -ForegroundColor Green
}

# ============================================
# PASSO 3: Pedir senha do PostgreSQL
# ============================================
Write-Host ""
Write-Host "[3/9] Configuracao do PostgreSQL..." -ForegroundColor Yellow

if ([string]::IsNullOrEmpty($PgPassword)) {
    Write-Host "      Digite a senha do usuario 'postgres': " -NoNewline -ForegroundColor Cyan
    $PgPassword = Read-Host -AsSecureString
    $PgPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($PgPassword))
}

# Testar conexao
Write-Host "      Testando conexao com PostgreSQL..." -ForegroundColor Yellow
$testOutput = & $psqlPath -h localhost -U postgres -d postgres -c "SELECT version();" -w $PgPassword 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERRO: Nao foi possivel conectar ao PostgreSQL" -ForegroundColor Red
    Write-Host "      Verifique se a senha esta correta" -ForegroundColor Yellow
    exit 1
}

Write-Host "      Conexao OK!" -ForegroundColor Green

# ============================================
# PASSO 4: Criar banco de dados
# ============================================
Write-Host ""
Write-Host "[4/9] Verificando banco de dados 'arvoredo'..." -ForegroundColor Yellow

$checkDb = & $psqlPath -h localhost -U postgres -d postgres -c "SELECT 1 FROM pg_database WHERE datname = 'arvoredo';" -w $PgPassword -t 2>&1
$dbExists = $checkDb -match "1"

if ($dbExists) {
    Write-Host "      Banco 'arvoredo' ja existe" -ForegroundColor Green
} else {
    Write-Host "      Criando banco 'arvoredo'..." -ForegroundColor Yellow
    $createDb = & $psqlPath -h localhost -U postgres -d postgres -c "CREATE DATABASE arvoredo;" -w $PgPassword 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Banco 'arvoredo' criado!" -ForegroundColor Green
    } else {
        Write-Host "      ERRO ao criar banco: $createDb" -ForegroundColor Red
        exit 1
    }
}

# ============================================
# PASSO 5: Verificar Node.js
# ============================================
Write-Host ""
Write-Host "[5/9] Verificando Node.js..." -ForegroundColor Yellow

try {
    $nodeVersion = node -v
    Write-Host "      Node.js $nodeVersion OK" -ForegroundColor Green
} catch {
    Write-Host "      ERRO: Node.js nao instalado" -ForegroundColor Red
    Write-Host "      Por favor, instale o Node.js LTS:" -ForegroundColor Yellow
    Write-Host "      1. Baixe em: https://nodejs.org" -ForegroundColor Gray
    Write-Host "      2. Execute o instalador" -ForegroundColor Gray
    Write-Host "      3. Apos instalar, execute este script novamente" -ForegroundColor Gray
    exit 1
}

# ============================================
# PASSO 6: Verificar/Instalar pnpm
# ============================================
Write-Host ""
Write-Host "[6/9] Verificando pnpm..." -ForegroundColor Yellow

try {
    pnpm -v 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "" }
    $pnpmVersion = pnpm -v
    Write-Host "      pnpm $pnpmVersion OK" -ForegroundColor Green
} catch {
    Write-Host "      Instalando pnpm..." -ForegroundColor Yellow
    npm install -g pnpm 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      ERRO ao instalar pnpm" -ForegroundColor Red
        exit 1
    }
    Write-Host "      pnpm instalado!" -ForegroundColor Green
}

# ============================================
# PASSO 7: Instalar dependencias
# ============================================
Write-Host ""
Write-Host "[7/9] Instalando dependencias do projeto..." -ForegroundColor Yellow

pnpm install 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERRO ao instalar dependencias" -ForegroundColor Red
    exit 1
}
Write-Host "      Dependencias OK!" -ForegroundColor Green

# Instalar dependencias extras para backup
Write-Host "      Instalando xlsx e pg (para backup Excel)..." -ForegroundColor Yellow
npm install xlsx pg 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "      xlsx e pg OK" -ForegroundColor Green
} else {
    Write-Host "      AVISO: Erro ao instalar xlsx/pg" -ForegroundColor Yellow
}

# ============================================
# PASSO 8: Criar tabelas no banco
# ============================================
Write-Host ""
Write-Host "[8/9] Criando tabelas no banco de dados..." -ForegroundColor Yellow

$env:DATABASE_URL = "postgresql://postgres:${PgPassword}@localhost:5432/arvoredo"

try {
    pnpm --filter @workspace/db run push 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Tabelas criadas!" -ForegroundColor Green
    } else {
        Write-Host "      AVISO: Problema ao criar tabelas" -ForegroundColor Yellow
    }
} catch {
    Write-Host "      ERRO ao criar tabelas: $_" -ForegroundColor Red
}

# ============================================
# PASSO 9: Configurar .env
# ============================================
Write-Host ""
Write-Host "[9/9] Configurando arquivo .env..." -ForegroundColor Yellow

$envFile = Join-Path $InstallPath ".env"
$envContent = @"
DATABASE_URL=postgresql://postgres:${PgPassword}@localhost:5432/arvoredo
PORT=8080
"@

$envContent | Out-File -FilePath $envFile -Encoding UTF8
Write-Host "      .env configurado!" -ForegroundColor Green

# ============================================
# FIM
# ============================================
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Instalacao concluida com sucesso!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Resumo da instalacao:" -ForegroundColor White
Write-Host "  - Local: $InstallPath" -ForegroundColor Gray
Write-Host "  - Banco de dados: arvoredo" -ForegroundColor Gray
Write-Host "  - Tabelas: criadas" -ForegroundColor Gray
Write-Host "  - Configuracao: .env" -ForegroundColor Gray
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Como usar:" -ForegroundColor White
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ABRIR O SISTEMA:" -ForegroundColor White
Write-Host "  cd $InstallPath" -ForegroundColor Gray
Write-Host "  .\deployment\iniciar.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "  FAZER BACKUP EXCEL:" -ForegroundColor White
Write-Host "  .\deployment\backup-excel.ps1 -OpenAfter" -ForegroundColor Gray
Write-Host ""
Write-Host "  ATUALIZAR (quando voce enviar mudancas):" -ForegroundColor White
Write-Host "  .\deployment\atualizar.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "  PARAR O SISTEMA:" -ForegroundColor White
Write-Host "  .\deployment\parar.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  URLs do sistema:" -ForegroundColor White
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  API:      http://localhost:8080/api/healthz" -ForegroundColor White
Write-Host ""
