# Arvoredo PDV - Script de Backup em Excel
# Gera relatorio do dia em formato Excel (.xlsx)
# Os dados sao exportados do banco PostgreSQL

param(
    [string]$PgPassword = "",
    [DateTime]$Data = (Get-Date),
    [string]$OutputDir = "",
    [switch]$OpenAfter
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ScriptDir).Parent.FullName

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Arvoredo PDV - Backup Excel" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Configurar DATABASE_URL se necessario
if ([string]::IsNullOrEmpty($env:DATABASE_URL)) {
    if ([string]::IsNullOrEmpty($PgPassword)) {
        # Tentar ler do .env
        $envFile = Join-Path $ProjectRoot ".env"
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

# Parse da DATABASE_URL
$dbUrl = $env:DATABASE_URL
if ($dbUrl -match "postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)") {
    $PgUser = $Matches[1]
    $PgPass = $Matches[2]
    $PgHost = $Matches[3]
    $PgPort = $Matches[4]
    $DbName = $Matches[5]
} else {
    Write-Host "ERRO: DATABASE_URL invalida" -ForegroundColor Red
    exit 1
}

# Diretorio de saida
if ([string]::IsNullOrEmpty($OutputDir)) {
    $OutputDir = Join-Path $ProjectRoot "Backups"
}
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# Nome do arquivo
$dateStr = $Data.ToString("yyyy-MM-dd")
$timeStr = $Data.ToString("HHmmss")
$fileName = "Arvoredo_Backup_${dateStr}_${timeStr}.xlsx"
$outputPath = Join-Path $OutputDir $fileName

Write-Host "[1/7] Configuracoes..." -ForegroundColor Yellow
Write-Host "      Data: $dateStr" -ForegroundColor Gray
Write-Host "      Destino: $outputPath" -ForegroundColor Gray

# Data format for SQL (YYYY-MM-DD)
$sqlDate = $Data.ToString("yyyy-MM-dd")

# Criar arquivo Excel usando OpenXML (CSV com extensao xlsx funciona, mas vamos usar formato real)
# Para formato Excel real, vamos usar a biblioteca xlsx via Node.js

Write-Host "[2/7] Verificando Node.js..." -ForegroundColor Yellow
$nodeVersion = node -v 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Node.js nao encontrado" -ForegroundColor Red
    exit 1
}
Write-Host "      Node.js $nodeVersion OK" -ForegroundColor Green

# Criar script temporario para gerar Excel
Write-Host "[3/7] Preparando geracao do Excel..." -ForegroundColor Yellow

$excelScript = @"
const { Client } = require('pg');
const XLSX = require('xlsx');

async function generateBackup() {
    const client = new Client({
        host: '${PgHost}',
        port: ${PgPort},
        user: '${PgUser}',
        password: '${PgPass}',
        database: '${DbName}'
    });

    await client.connect();

    const data = {
        'Vendas': [],
        'Itens Vendidos': [],
        'Sangrias': [],
        'Caixa': [],
        'Produtos': [],
        'Clientes': [],
        'Fiados': [],
        'Movimentos Estoque': []
    };

    // Vendas do dia
    try {
        const vendas = await client.query(\`
            SELECT v.id, v.criado_em, v.total, v.desconto, v.pagamento, v.categoria, v.observacao,
                   c.nome as cliente_nome
            FROM vendas v
            LEFT JOIN clientes c ON v.cliente_id = c.id
            WHERE DATE(v.criado_em) = '${sqlDate}'
            ORDER BY v.criado_em DESC
        \`);
        data['Vendas'] = vendas.rows.map(r => ({
            'ID': r.id,
            'Data/Hora': r.criado_em,
            'Total (R$)': r.total,
            'Desconto (R$)': r.desconto,
            'Pagamento': r.pagamento,
            'Categoria': r.categoria,
            'Cliente': r.cliente_nome || '',
            'Observacao': r.observacao || ''
        }));
    } catch (e) {
        console.error('Erro em Vendas:', e.message);
    }

    // Itens Vendidos do dia
    try {
        const itens = await client.query(\`
            SELECT iv.id, iv.venda_id, iv.nome_snap, iv.quantidade, iv.preco_unit, iv.subtotal, v.criado_em
            FROM itens_venda iv
            JOIN vendas v ON iv.venda_id = v.id
            WHERE DATE(v.criado_em) = '${sqlDate}'
            ORDER BY v.criado_em DESC, iv.id
        \`);
        data['Itens Vendidos'] = itens.rows.map(r => ({
            'ID Item': r.id,
            'ID Venda': r.venda_id,
            'Data Venda': r.criado_em,
            'Produto': r.nome_snap,
            'Quantidade': r.quantidade,
            'Preco Unit (R$)': r.preco_unit,
            'Subtotal (R$)': r.subtotal
        }));
    } catch (e) {
        console.error('Erro em Itens Vendidos:', e.message);
    }

    // Sangrias do dia
    try {
        const sangrias = await client.query(\`
            SELECT s.id, s.valor, s.motivo, s.criado_em, sc.aberto_em
            FROM sangrias s
            JOIN sessoes_caixa sc ON s.sessao_id = sc.id
            WHERE DATE(s.criado_em) = '${sqlDate}'
            ORDER BY s.criado_em DESC
        \`);
        data['Sangrias'] = sangrias.rows.map(r => ({
            'ID': r.id,
            'Data/Hora': r.criado_em,
            'Valor (R$)': r.valor,
            'Motivo': r.motivo || ''
        }));
    } catch (e) {
        console.error('Erro em Sangrias:', e.message);
    }

    // Caixa do dia
    try {
        const caixa = await client.query(\`
            SELECT id, aberto_em, fechado_em, fundo_inicial, total_dinheiro, total_pix, 
                   total_cartao, total_fiado, total_sangria, status
            FROM sessoes_caixa
            WHERE DATE(aberto_em) = '${sqlDate}' OR DATE(fechado_em) = '${sqlDate}'
            ORDER BY aberto_em DESC
        \`);
        data['Caixa'] = caixa.rows.map(r => ({
            'ID': r.id,
            'Aberto em': r.aberto_em,
            'Fechado em': r.fechado_em,
            'Fundo Inicial (R$)': r.fundo_inicial,
            'Total Dinheiro (R$)': r.total_dinheiro,
            'Total PIX (R$)': r.total_pix,
            'Total Cartao (R$)': r.total_cartao,
            'Total Fiado (R$)': r.total_fiado,
            'Total Sangria (R$)': r.total_sangria,
            'Status': r.status
        }));
    } catch (e) {
        console.error('Erro em Caixa:', e.message);
    }

    // Produtos
    try {
        const produtos = await client.query(\`
            SELECT id, codigo, nome, marca, categoria, preco, estoque, estoque_min, unidade, ativo
            FROM produtos
            WHERE ativo = true
            ORDER BY nome
        \`);
        data['Produtos'] = produtos.rows.map(r => ({
            'ID': r.id,
            'Codigo': r.codigo || '',
            'Nome': r.nome,
            'Marca': r.marca || '',
            'Categoria': r.categoria,
            'Preco (R$)': r.preco,
            'Estoque': r.estoque,
            'Estoque Min': r.estoque_min,
            'Unidade': r.unidade,
            'Ativo': r.ativo ? 'Sim' : 'Nao'
        }));
    } catch (e) {
        console.error('Erro em Produtos:', e.message);
    }

    // Clientes
    try {
        const clientes = await client.query(\`
            SELECT id, nome, telefone, observacao, criado_em
            FROM clientes
            ORDER BY nome
        \`);
        data['Clientes'] = clientes.rows.map(r => ({
            'ID': r.id,
            'Nome': r.nome,
            'Telefone': r.telefone || '',
            'Observacao': r.observacao || '',
            'Cadastrado em': r.criado_em
        }));
    } catch (e) {
        console.error('Erro em Clientes:', e.message);
    }

    // Fiados do dia
    try {
        const fiados = await client.query(\`
            SELECT f.id, f.valor, f.pago, f.pago_em, f.criado_em,
                   c.nome as cliente_nome, v.id as venda_id
            FROM fiados f
            JOIN clientes c ON f.cliente_id = c.id
            LEFT JOIN vendas v ON f.venda_id = v.id
            WHERE DATE(f.criado_em) = '${sqlDate}'
            ORDER BY f.criado_em DESC
        \`);
        data['Fiados'] = fiados.rows.map(r => ({
            'ID': r.id,
            'Data/Hora': r.criado_em,
            'Cliente': r.cliente_nome,
            'ID Venda': r.venda_id || '',
            'Valor (R$)': r.valor,
            'Pago': r.pago ? 'Sim' : 'Nao',
            'Pago em': r.pago_em || ''
        }));
    } catch (e) {
        console.error('Erro em Fiados:', e.message);
    }

    // Movimentos de Estoque do dia
    try {
        const movimentos = await client.query(\`
            SELECT m.id, m.tipo, m.quantidade, m.motivo, m.criado_em,
                   p.nome as produto_nome
            FROM movimentos_estoque m
            JOIN produtos p ON m.produto_id = p.id
            WHERE DATE(m.criado_em) = '${sqlDate}'
            ORDER BY m.criado_em DESC
        \`);
        data['Movimentos Estoque'] = movimentos.rows.map(r => ({
            'ID': r.id,
            'Data/Hora': r.criado_em,
            'Produto': r.produto_nome,
            'Tipo': r.tipo,
            'Quantidade': r.quantidade,
            'Motivo': r.motivo || ''
        }));
    } catch (e) {
        console.error('Erro em Movimentos:', e.message);
    }

    // Criar workbook
    const workbook = XLSX.utils.book_new();
    
    for (const [sheetName, sheetData] of Object.entries(data)) {
        if (sheetData.length > 0) {
            const worksheet = XLSX.utils.json_to_sheet(sheetData);
            
            // Ajustar larguras das colunas
            const colWidths = Object.keys(sheetData[0]).map(key => ({
                wch: Math.max(key.length, 15)
            }));
            worksheet['!cols'] = colWidths;
            
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        }
    }

    // Adicionar aba de Resumo
    const resumo = {
        'Resumo': [{
            'Data do Backup': '${dateStr}',
            'Total de Vendas': data['Vendas'].length,
            'Total Itens Vendidos': data['Itens Vendidos'].length,
            'Total Sangrias': data['Sangrias'].length,
            'Valor Total Vendas (R$)': data['Vendas'].reduce((sum, v) => sum + (v['Total (R$)'] || 0), 0).toFixed(2),
            'Produtos Cadastrados': data['Produtos'].length,
            'Clientes Cadastrados': data['Clientes'].length
        }]
    };
    
    const resumoSheet = XLSX.utils.json_to_sheet(resumo['Resumo']);
    XLSX.utils.book_append_sheet(workbook, resumoSheet, 'Resumo');

    // Salvar arquivo
    XLSX.writeFile(workbook, '${outputPath}');
    console.log('Backup gerado com sucesso: ${fileName}');
    
    await client.end();
}

generateBackup().catch(err => {
    console.error('Erro ao gerar backup:', err);
    process.exit(1);
});
"@

# Salvar script temporario
$tempScriptPath = Join-Path $env:TEMP "arvoredo_backup_$PID.mjs"
$excelScript | Out-File -FilePath $tempScriptPath -Encoding UTF8

# Verificar/instalar dependencia xlsx
Write-Host "[4/7] Verificando biblioteca xlsx..." -ForegroundColor Yellow
$nodeModulesXlsx = Join-Path $ProjectRoot "node_modules\xlsx"
$needInstallXlsx = $false

if (-not (Test-Path $nodeModulesXlsx)) {
    Write-Host "      Instalando xlsx..." -ForegroundColor Yellow
    $needInstallXlsx = $true
}

if ($needInstallXlsx) {
    try {
        npm install xlsx --prefix $ProjectRoot 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Erro ao instalar xlsx"
        }
    } catch {
        Write-Host "ERRO: Nao foi possivel instalar a biblioteca xlsx" -ForegroundColor Red
        Write-Host "Tente instalar manualmente: npm install xlsx --prefix . " -ForegroundColor Yellow
        Remove-Item $tempScriptPath -Force -ErrorAction SilentlyContinue
        exit 1
    }
}

# Executar script de geracao
Write-Host "[5/7] Conectando ao banco..." -ForegroundColor Yellow
try {
    # Criar arquivo package.json temporario com modulo pg
    $backupScript = @"
const { Client } = require('pg');
const path = require('path');
const XLSX = require('xlsx');

async function generateBackup() {
    const client = new Client({
        host: '${PgHost}',
        port: ${PgPort},
        user: '${PgUser}',
        password: '${PgPass}',
        database: '${DbName}'
    });

    await client.connect();
"@

    # Gerar o script completo inline
    $fullScript = @"
// Inline backup script
const path = require('path');
const XLSX = require('xlsx');
const { Client } = require('pg');

const client = new Client({
    host: '${PgHost}',
    port: ${PgPort},
    user: '${PgUser}',
    password: '${PgPass}',
    database: '${DbName}'
});

async function generateBackup() {
    await client.connect();

    const data = {
        'Vendas': [],
        'Itens Vendidos': [],
        'Sangrias': [],
        'Caixa': [],
        'Produtos': [],
        'Clientes': [],
        'Fiados': [],
        'Movimentos Estoque': []
    };

    try {
        const vendas = await client.query(\`
            SELECT v.id, v.criado_em, v.total, v.desconto, v.pagamento, v.categoria, v.observacao,
                   c.nome as cliente_nome
            FROM vendas v
            LEFT JOIN clientes c ON v.cliente_id = c.id
            WHERE DATE(v.criado_em) = '${sqlDate}'
            ORDER BY v.criado_em DESC
        \`);
        data['Vendas'] = vendas.rows.map(r => ({
            'ID': r.id,
            'Data/Hora': r.criado_em,
            'Total (R$)': r.total,
            'Desconto (R$)': r.desconto,
            'Pagamento': r.pagamento,
            'Categoria': r.categoria,
            'Cliente': r.cliente_nome || '',
            'Observacao': r.observacao || ''
        }));
    } catch (e) { console.error('Vendas:', e.message); }

    try {
        const itens = await client.query(\`
            SELECT iv.id, iv.venda_id, iv.nome_snap, iv.quantidade, iv.preco_unit, iv.subtotal, v.criado_em
            FROM itens_venda iv
            JOIN vendas v ON iv.venda_id = v.id
            WHERE DATE(v.criado_em) = '${sqlDate}'
            ORDER BY v.criado_em DESC, iv.id
        \`);
        data['Itens Vendidos'] = itens.rows.map(r => ({
            'ID Item': r.id,
            'ID Venda': r.venda_id,
            'Data Venda': r.criado_em,
            'Produto': r.nome_snap,
            'Quantidade': r.quantidade,
            'Preco Unit (R$)': r.preco_unit,
            'Subtotal (R$)': r.subtotal
        }));
    } catch (e) { console.error('Itens:', e.message); }

    try {
        const sangrias = await client.query(\`
            SELECT s.id, s.valor, s.motivo, s.criado_em
            FROM sangrias s
            WHERE DATE(s.criado_em) = '${sqlDate}'
            ORDER BY s.criado_em DESC
        \`);
        data['Sangrias'] = sangrias.rows.map(r => ({
            'ID': r.id,
            'Data/Hora': r.criado_em,
            'Valor (R$)': r.valor,
            'Motivo': r.motivo || ''
        }));
    } catch (e) { console.error('Sangrias:', e.message); }

    try {
        const caixa = await client.query(\`
            SELECT id, aberto_em, fechado_em, fundo_inicial, total_dinheiro, total_pix, 
                   total_cartao, total_fiado, total_sangria, status
            FROM sessoes_caixa
            WHERE DATE(aberto_em) = '${sqlDate}' OR DATE(fechado_em) = '${sqlDate}'
            ORDER BY aberto_em DESC
        \`);
        data['Caixa'] = caixa.rows.map(r => ({
            'ID': r.id,
            'Aberto em': r.aberto_em,
            'Fechado em': r.fechado_em || '',
            'Fundo Inicial (R$)': r.fundo_inicial,
            'Total Dinheiro (R$)': r.total_dinheiro,
            'Total PIX (R$)': r.total_pix,
            'Total Cartao (R$)': r.total_cartao,
            'Total Fiado (R$)': r.total_fiado,
            'Total Sangria (R$)': r.total_sangria,
            'Status': r.status
        }));
    } catch (e) { console.error('Caixa:', e.message); }

    try {
        const produtos = await client.query(\`
            SELECT id, codigo, nome, marca, categoria, preco, estoque, estoque_min, unidade, ativo
            FROM produtos
            WHERE ativo = true
            ORDER BY nome
        \`);
        data['Produtos'] = produtos.rows.map(r => ({
            'ID': r.id,
            'Codigo': r.codigo || '',
            'Nome': r.nome,
            'Marca': r.marca || '',
            'Categoria': r.categoria,
            'Preco (R$)': r.preco,
            'Estoque': r.estoque,
            'Estoque Min': r.estoque_min,
            'Unidade': r.unidade,
            'Ativo': r.ativo ? 'Sim' : 'Nao'
        }));
    } catch (e) { console.error('Produtos:', e.message); }

    try {
        const clientes = await client.query(\`
            SELECT id, nome, telefone, observacao, criado_em
            FROM clientes
            ORDER BY nome
        \`);
        data['Clientes'] = clientes.rows.map(r => ({
            'ID': r.id,
            'Nome': r.nome,
            'Telefone': r.telefone || '',
            'Observacao': r.observacao || '',
            'Cadastrado em': r.criado_em
        }));
    } catch (e) { console.error('Clientes:', e.message); }

    try {
        const fiados = await client.query(\`
            SELECT f.id, f.valor, f.pago, f.pago_em, f.criado_em,
                   c.nome as cliente_nome, v.id as venda_id
            FROM fiados f
            JOIN clientes c ON f.cliente_id = c.id
            LEFT JOIN vendas v ON f.venda_id = v.id
            WHERE DATE(f.criado_em) = '${sqlDate}'
            ORDER BY f.criado_em DESC
        \`);
        data['Fiados'] = fiados.rows.map(r => ({
            'ID': r.id,
            'Data/Hora': r.criado_em,
            'Cliente': r.cliente_nome,
            'ID Venda': r.venda_id || '',
            'Valor (R$)': r.valor,
            'Pago': r.pago ? 'Sim' : 'Nao',
            'Pago em': r.pago_em || ''
        }));
    } catch (e) { console.error('Fiados:', e.message); }

    try {
        const movimentos = await client.query(\`
            SELECT m.id, m.tipo, m.quantidade, m.motivo, m.criado_em,
                   p.nome as produto_nome
            FROM movimentos_estoque m
            JOIN produtos p ON m.produto_id = p.id
            WHERE DATE(m.criado_em) = '${sqlDate}'
            ORDER BY m.criado_em DESC
        \`);
        data['Movimentos Estoque'] = movimentos.rows.map(r => ({
            'ID': r.id,
            'Data/Hora': r.criado_em,
            'Produto': r.produto_nome,
            'Tipo': r.tipo,
            'Quantidade': r.quantidade,
            'Motivo': r.motivo || ''
        }));
    } catch (e) { console.error('Movimentos:', e.message); }

    const workbook = XLSX.utils.book_new();
    
    for (const [sheetName, sheetData] of Object.entries(data)) {
        if (sheetData.length > 0) {
            const worksheet = XLSX.utils.json_to_sheet(sheetData);
            const colWidths = Object.keys(sheetData[0]).map(key => ({ wch: Math.max(key.length, 15) }));
            worksheet['!cols'] = colWidths;
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        }
    }

    const totalVendas = data['Vendas'].reduce((sum, v) => sum + (v['Total (R$)'] || 0), 0);
    const resumo = [{
        'Data do Backup': '${dateStr}',
        'Total de Vendas': data['Vendas'].length,
        'Total Itens': data['Itens Vendidos'].length,
        'Total Sangrias': data['Sangrias'].length,
        'Valor Total Vendas (R$)': totalVendas.toFixed(2),
        'Produtos': data['Produtos'].length,
        'Clientes': data['Clientes'].length
    }];
    
    const resumoSheet = XLSX.utils.json_to_sheet(resumo);
    XLSX.utils.book_append_sheet(workbook, resumoSheet, 'Resumo');

    XLSX.writeFile(workbook, '${outputPath}');
    console.log('OK: ${fileName}');
    
    await client.end();
}

generateBackup().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
});
"@

    $scriptPath = Join-Path $ProjectRoot "backup_temp.js"
    $fullScript | Out-File -FilePath $scriptPath -Encoding UTF8
    
} catch {
    Write-Host "ERRO ao preparar script: $_" -ForegroundColor Red
    exit 1
}

Write-Host "[6/7] Gerando arquivo Excel..." -ForegroundColor Yellow
try {
    Set-Location $ProjectRoot
    node backup_temp.js 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Erro na geracao"
    }
} catch {
    Write-Host "ERRO: $_" -ForegroundColor Red
    Remove-Item $scriptPath -Force -ErrorAction SilentlyContinue
    exit 1
}

# Limpar arquivo temporario
Remove-Item $scriptPath -Force -ErrorAction SilentlyContinue

Write-Host "[7/7] Verificando arquivo..." -ForegroundColor Yellow
if (Test-Path $outputPath) {
    $fileSize = (Get-Item $outputPath).Length
    Write-Host "      Arquivo gerado: $fileName" -ForegroundColor Green
    Write-Host "      Tamanho: $([math]::Round($fileSize / 1024, 2)) KB" -ForegroundColor Gray
    Write-Host "      Caminho: $outputPath" -ForegroundColor Gray
} else {
    Write-Host "ERRO: Arquivo nao foi gerado" -ForegroundColor Red
    exit 1
}

# Abrir arquivo se solicitado
if ($OpenAfter) {
    Write-Host ""
    Write-Host "Abrindo arquivo..." -ForegroundColor Cyan
    Start-Process $outputPath
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Backup Excel gerado com sucesso!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Abra o arquivo no Excel para visualizar os dados." -ForegroundColor White
Write-Host ""
