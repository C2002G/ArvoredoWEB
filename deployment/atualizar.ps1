# Arvoredo PDV - Script de Atualizacao
# Execute este script para atualizar o sistema via Git

param(
    [string]$PgPassword = "",
    [switch]$ForceRebuild
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ScriptDir).Parent.FullName

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Arvoredo PDV - Atualizando Sistema" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se e um repositorio git
if (-not (Test-Path (Join-Path $ProjectRoot ".git"))) {
    Write-Host "ERRO: Este diretorio nao e um repositorio Git" -ForegroundColor Red
    Write-Host "O sistema deve ter sido clonado via Git para funcionar" -ForegroundColor Yellow
    exit 1
}

# Preferir DATABASE_URL completa do .env (necessario para drizzle-kit push)
$envFile = Join-Path $ProjectRoot ".env"
if ([string]::IsNullOrEmpty($env:DATABASE_URL) -and (Test-Path $envFile)) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)\s*$') {
            $raw = $Matches[1].Trim().Trim('"').Trim("'")
            if (-not [string]::IsNullOrEmpty($raw)) {
                $env:DATABASE_URL = $raw
            }
        }
    }
}

# Configurar DATABASE_URL se necessario
if ([string]::IsNullOrEmpty($env:DATABASE_URL)) {
    if ([string]::IsNullOrEmpty($PgPassword)) {
        # Tentar ler senha do .env (fallback se nao houver DATABASE_URL)
        if (Test-Path $envFile) {
            $envContent = Get-Content $envFile -Raw
            if ($envContent -match "postgres:([^@]+)@") {
                $PgPassword = $Matches[1]
            }
        }
    }
    
    if ([string]::IsNullOrEmpty($PgPassword)) {
        Write-Host "Digite a senha do PostgreSQL: " -NoNewline -ForegroundColor Cyan
        $PgPassword = Read-Host
    }
    
    $env:DATABASE_URL = "postgresql://postgres:${PgPassword}@localhost:5432/arvoredo"
}

# 1. Verificar conexao com Git remote
Write-Host "[1/7] Verificando conexao com Git..." -ForegroundColor Yellow
Set-Location $ProjectRoot
git remote -v | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERRO: Problema com repositorio Git" -ForegroundColor Red
    exit 1
}
Write-Host "      Git OK" -ForegroundColor Green

# 2. Buscar atualizacoes
Write-Host "[2/7] Buscando atualizacoes..." -ForegroundColor Yellow
git fetch origin 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "      AVISO: Nao foi possivel buscar atualizacoes (verifique internet)" -ForegroundColor Yellow
} else {
    Write-Host "      Busca OK" -ForegroundColor Green
}

# 3. Verificar se ha atualizacoes
Write-Host "[3/7] Verificando atualizacoes..." -ForegroundColor Yellow
$branch = git branch --show-current
if ([string]::IsNullOrEmpty($branch)) {
    $branch = "main"
}

$localCommit = git rev-parse HEAD
$remoteCommit = git rev-parse "origin/$branch"

if ($localCommit -eq $remoteCommit) {
    Write-Host "      Sistema ja esta na versao mais recente" -ForegroundColor Green
    $hasUpdates = $false
} else {
    Write-Host "      Ha atualizacoes disponiveis!" -ForegroundColor Green
    $hasUpdates = $true
}

# 4. Pull se houver atualizacoes
if ($hasUpdates) {
    Write-Host "[4/7] Baixando atualizacoes..." -ForegroundColor Yellow
    git pull origin $branch 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      ERRO no git pull. Voce pode ter mudancas locais." -ForegroundColor Red
        Write-Host "      Use 'git status' para ver conflitos" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "      Atualizacoes baixadas!" -ForegroundColor Green
}

# 5. Dependencias (apos pull, alinhar lockfile e pacotes)
Write-Host "[5/7] Dependencias..." -ForegroundColor Yellow
if ($hasUpdates -or $ForceRebuild) {
    Write-Host "      Executando pnpm install..." -ForegroundColor Gray
    pnpm install 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      ERRO na instalacao de dependencias" -ForegroundColor Red
        exit 1
    }
    Write-Host "      Dependencias OK" -ForegroundColor Green
} else {
    Write-Host "      Nada a instalar (ja na ultima versao)" -ForegroundColor Gray
}

# 6. Schema do banco (Drizzle push) — evita erro de colunas faltando na API
Write-Host "[6/7] Banco de dados (Drizzle push)..." -ForegroundColor Yellow
if ($hasUpdates -or $ForceRebuild) {
    if ([string]::IsNullOrEmpty($env:DATABASE_URL)) {
        Write-Host "      ERRO: DATABASE_URL nao definido. Confira .env na raiz do projeto." -ForegroundColor Red
        exit 1
    }
    pnpm --filter @workspace/db push 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      ERRO no db push. Verifique PostgreSQL e DATABASE_URL no .env." -ForegroundColor Red
        exit 1
    }
    Write-Host "      Schema sincronizado" -ForegroundColor Green
} else {
    Write-Host "      Pulado (sem atualizacoes)" -ForegroundColor Gray
}

# 7. Rebuild se necessario
if ($hasUpdates -or $ForceRebuild) {
    Write-Host "[7/7] Rebuild do sistema..." -ForegroundColor Yellow
    
    # Parar processos antigos
    Write-Host "      Parando processos antigos..." -ForegroundColor Gray
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    
    # Rebuild
    pnpm run build 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      ERRO no build. Verifique o log acima." -ForegroundColor Red
        exit 1
    }
    Write-Host "      Build OK" -ForegroundColor Green
} else {
    Write-Host "[7/7] Build nao necessario (sem atualizacoes)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Atualizacao concluida!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Inicie o sistema com: .\deployment\iniciar.ps1 (a partir da raiz do projeto)" -ForegroundColor Cyan
Write-Host ""
