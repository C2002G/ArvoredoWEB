# Arvoredo PDV - Backup Excel Personalizado

Este guia explica como personalizar o script de backup Excel (`backup-excel.ps1`).

## 1. Como Funciona

O script `backup-excel.ps1` conecta ao banco PostgreSQL e exporta dados para um arquivo Excel `.xlsx` com múltiplas abas:

| Aba | Descrição |
|-----|-----------|
| **Resumo** | overview do dia (total vendas, etc) |
| **Vendas** | Todas as vendas do dia |
| **Itens Vendidos** | Produtos vendidos em cada venda |
| **Sangrias** | Sangrias realizadas no dia |
| **Caixa** | Sessões de caixa do dia |
| **Produtos** | Estoque atual de todos os produtos |
| **Clientes** | Cadastro de clientes |
| **Fiados** | Movimentação de fiado do dia |
| **Movimentos Estoque** | Alterações de estoque do dia |

---

## 2. Customizações Básicas

### 2.1. Mudar Local de Salvamento

Edite a variável `$OutputDir` no script ou passe como parâmetro:

```powershell
# Via parametro
.\backup-excel.ps1 -OutputDir "D:\Backups\Mercado"

# Padrao: C:\Arvoredo\Backups
```

### 2.2. Mudar Data do Backup

```powershell
# Backup de data especifica
.\backup-excel.ps1 -Data "2026-04-01"

# Padrao: data atual
```

### 2.3. Gerar e Abrir Automaticamente

```powershell
.\backup-excel.ps1 -OpenAfter
```

---

## 3. Customizações Avançadas (Editando o Script)

### 3.1. Adicionar/Remover Colunas

Procure a seção de cada tabela no script. Por exemplo, para **Vendas**:

```javascript
data['Vendas'] = vendas.rows.map(r => ({
    'ID': r.id,
    'Data/Hora': r.criado_em,
    'Total (R$)': r.total,
    'Desconto (R$)': r.desconto,
    'Pagamento': r.pagamento,           // <- remover esta coluna
    'Categoria': r.categoria,
    'Cliente': r.cliente_nome || '',
    'Observacao': r.observacao || ''
    // 'Nova Coluna': r.nova_coluna,     // <- adicionar nova coluna
}));
```

### 3.2. Adicionar Nova Tabela

Insira um novo bloco antes da linha `// Criar workbook`:

```javascript
// NOVA TABELA
try {
    const novaTabela = await client.query(`
        SELECT id, campo1, campo2
        FROM sua_tabela
        WHERE DATE(criado_em) = '${sqlDate}'
        ORDER BY id
    `);
    data['Nome da Aba'] = novaTabela.rows.map(r => ({
        'ID': r.id,
        'Campo 1': r.campo1,
        'Campo 2': r.campo2
    }));
} catch (e) {
    console.error('Erro em Nova Tabela:', e.message);
}
```

### 3.3. Filtrar Dados

No SQL query, adicione condições WHERE:

```javascript
// Filtrar por categoria
const vendas = await client.query(`
    SELECT * FROM vendas
    WHERE DATE(v.criado_em) = '${sqlDate}'
    AND categoria = 'mercado'  -- filtrar apenas categoria mercado
    ORDER BY v.criado_em DESC
`);

// Filtrar por forma de pagamento
const dinheiro = await client.query(`
    SELECT * FROM vendas
    WHERE DATE(v.criado_em) = '${sqlDate}'
    AND pagamento = 'dinheiro'  -- apenas vendas em dinheiro
    ORDER BY v.criado_em DESC
`);
```

### 3.4. Adicionar Fórmulas e Cálculos

Adicione na aba **Resumo**:

```javascript
const totalVendas = data['Vendas'].reduce((sum, v) => sum + (v['Total (R$)'] || 0), 0);
const totalDescontos = data['Vendas'].reduce((sum, v) => sum + (v['Desconto (R$)'] || 0), 0);
const mediaVenda = totalVendas / (data['Vendas'].length || 1);

const resumo = [{
    'Data do Backup': '${dateStr}',
    'Total de Vendas': data['Vendas'].length,
    'Valor Total (R$)': totalVendas.toFixed(2),
    'Total Descontos (R$)': totalDescontos.toFixed(2),
    'Media por Venda (R$)': mediaVenda.toFixed(2)
}];
```

---

## 4. Customizar por Forma de Pagamento

Se quiser separar por forma de pagamento:

```javascript
// Vendas em Dinheiro
try {
    const dinheiro = await client.query(`
        SELECT v.id, v.criado_em, v.total
        FROM vendas v
        WHERE DATE(v.criado_em) = '${sqlDate}'
        AND v.pagamento = 'dinheiro'
    `);
    data['Vendas Dinheiro'] = dinheiro.rows.map(r => ({
        'ID': r.id,
        'Data/Hora': r.criado_em,
        'Total (R$)': r.total
    }));
} catch (e) {}

// Vendas PIX
try {
    const pix = await client.query(`
        SELECT v.id, v.criado_em, v.total
        FROM vendas v
        WHERE DATE(v.criado_em) = '${sqlDate}'
        AND v.pagamento = 'pix'
    `);
    data['Vendas PIX'] = pix.rows.map(r => ({
        'ID': r.id,
        'Data/Hora': r.criado_em,
        'Total (R$)': r.total
    }));
} catch (e) {}
```

---

## 5. Agendar Backup Diário Automático

Crie uma Tarefa Agendada do Windows:

1. Abra **Agendador de Tarefas** (Task Scheduler)
2. **Criar Tarefa Básica**
3. Nome: `Arvoredo Backup Diario`
4. Disparo: **Diariamente** às 22:00
5. Ação: **Iniciar um programa**
6. Programa: `powershell.exe`
7. Argumentos: `-ExecutionPolicy Bypass -File "C:\Arvoredo\deployment\backup-excel.ps1"`

---

## 6. Gerar Backup de Período Específico

Para backup semanal ou mensal, use PowerShell:

```powershell
# Backup semanal (ultimos 7 dias)
for ($i = 0; $i -lt 7; $i++) {
    $data = (Get-Date).AddDays(-$i)
    .\backup-excel.ps1 -Data $data
}

# Backup mensal
for ($i = 0; $i -lt 30; $i++) {
    $data = (Get-Date).AddDays(-$i)
    .\backup-excel.ps1 -Data $data
}
```

---

## 7. Exportar Apenas Uma Aba Específica

Crie um script específico para exportar só uma tabela:

```powershell
# backup-produtos.ps1 - Exporta apenas produtos
$scriptContent = @"
// Copie o bloco de Produtos do script principal
// E remova todas as outras tabelas
"@
```

---

## 8. Parametros Rápidos

| Parâmetro | Descrição | Exemplo |
|-----------|-----------|---------|
| `-PgPassword` | Senha do PostgreSQL | `-PgPassword "minhasenha"` |
| `-Data` | Data do backup | `-Data "2026-04-01"` |
| `-OutputDir` | Pasta de destino | `-OutputDir "D:\Backups"` |
| `-OpenAfter` | Abre o arquivo após gerar | `-OpenAfter` |

Combinar parâmetros:

```powershell
.\backup-excel.ps1 -PgPassword "minhasenha" -Data "2026-04-01" -OutputDir "D:\Relatorios" -OpenAfter
```

---

## 9. Resolução de Problemas

### Erro: "xlsx nao encontrado"

Instale a biblioteca manualmente:

```powershell
npm install xlsx
```

### Erro: "pg nao encontrado"

Instale a biblioteca:

```powershell
npm install pg
```

### Arquivo vazio ou dados incorretos

Verifique se a data está correta no formato `YYYY-MM-DD`.

---

## 10. Estrutura do Banco de Dados

Para referência, aqui estão as tabelas disponíveis:

```
vendas           - Vendas realizadas
itens_venda      - Itens de cada venda
sessoes_caixa    - Abertura/fechamento de caixa
sangrias         - Retiradas de dinheiro do caixa
produtos         - Cadastro de produtos
clientes         - Cadastro de clientes
fiados           - Dívidas de clientes
movimentos_estoque - Alterações de estoque
```

Consulte o arquivo `lib/db/src/schema/` para ver todas as colunas disponíveis.
