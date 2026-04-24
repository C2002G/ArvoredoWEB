# Guia de perguntas para o Contato do Estabelecimento

Objetivo: Coletar todas as informações necessárias para configurar o sistema e emitir notas fiscais.

---

## 1) Dados do Estabelecimento (para nota fiscal)

- **Nome fantasia:**
- **Razão social:**
- **CNPJ:** (ou CPF se for MEI)
- **Endereço completo:**
  - Rua/Av:
  - Número:
  - Complemento:
  - Bairro:
  - Cidade:
  - UF:
  - CEP:
- **Telefone:**
- **E-mail:**
- **Inscrição Estadual:**
- **Inscrição Municipal:**
- **CNAE principal:**
- **Regime Tributário:** ( ) Simples Nacional  ( ) Lucro Presumido  ( ) Lucro Real  ( ) MEI
- **Contador:** (nome/telefone/email) - opcional

---

## 2) Sistema de Produtos

- **Categorias:** Quais categorias de produtos existem? (ex: mercado, cozinha, laticínios, etc.)
- **Quantidade aproximada deSKUs:**
- **Como gerencia o estoque?** (primeira nota, controle de validade, etc.)
- ** Produtos com code de barras?** SIM / NÃO  - Se sim, tem leitor?

---

## 3) Vendas e Pagamentos

- **Forma de pagamento aceita:**
  - Dinheiro
  - PIX
  - Cartão de crédito
  - Cartão de débito
  - Fiado / Crediário
- **Maquininha de cartão:** Qual modelo? (ex: Rede, Safra, Stone, Getnet, outra)
  - Já tem API configurada? SIM / NÃO / NÃO SEI
- **Descontos:** Costuma dar desconto? Em quais situações?
- **Ticket médio:**
- **Média de vendas/dia:**

---

## 4) Clientes (Fiado e Nota Fiscal)

- **Clientes fieis tem cadastro?** SIM / NÃO
- **Quantos clientes cadastrados aproximadamente?**
- **Guarda histórico de fiado?** SIM / NÃO
- **Costuma emitir nota fiscal para cliente?** SIM / NÃO  - Se sim, necessidade de emitir NFC-e ou NFSe?

---

## 5) Caixa e Operações

- **Caixa:**
  - Quanto guarda em dinheiro no início do dia?
  - Faz sangria (retirada) durante o dia? Com que frequência?
  - Fecha o caixa no fim do dia? Faz reconcialiação?
- **Impressora térmica:**
  - Modelo?: (ex: Epson TM-T20, Bematech, Elgin)
  - Tem papel?: SIM / NÃO
- **Imprime cupom não fiscal?** (ex: sangria, relatório)

---

## 6) Infraestrutura Técnica

- **Onde vai rodar o sistema?**
  - Desktop (Windows)
  - Notebook
- **Sistema operacional:** Windows 10 / 11 / Outro
- **PostgreSQL:**
  - Já tem instalado? Qual senha do usuário `postgres`?
  - Precisa instalar do zero?
- **Impressora:** Conectada via USB / Rede / Bluetooth
- **Leitor de código de barras:** SIM / NÃO  - Modelo?
- **Scanner de mão:** SIM / NÃO

---

## 7) Informações Adicionais

- **Horário de funcionamento:**
- **Número de caixas:**
- **Funcionários que vão usar o sistema:**
- **Tem backup?** Onde salva?
- **Outro sistema em uso?** (ex: outro PDV,-planilha,etc)

---

## Checklist do que o sistema oferece

| Módulo | Descrição |
|--------|-----------|
| PDV | Cadastro de produtos com código, nome, marca, categoria, preço,custo,estoque |
| Vendas | Registro de vendas com desconto, forma pagamento, cliente |
| Caixa | Abertura/fechamento,sangria,relatório |
| Fiado | Controle de crediário por cliente |
| Estoque | Movimentos (entrada,saída,ajuste) |
| Impressão | Cupom térmico (requer impressora USB) |
| Maquininha | Integração com cartão (requer API) |
| Backup | Gera Excel diário |

---

## Próximos passos após coleta

1. Configurar base dados PostgreSQL
2. Criar produtos no sistema
3. Testar impressora
4. Configurar nota fiscal (seNECESSÁRIO)
5. Treinar operação básica