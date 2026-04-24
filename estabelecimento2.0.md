# Guia de Instalação - Arvoredo PDV 2.0

Este guia serve para instalar o sistema em um **PC limpo** ou após reset completo.

---

## Pré-requisitos

- Windows 10/11
- PostgreSQL 17+ instalado
- Node.js 20+ instalado
- Git instalado
- pnpm instalado (`npm install -g pnpm`)

---

## Passo 1: Preparar o Banco de Dados

1. Abra o **pgAdmin**
2. Clique com botão direito em **Databases** → **Create Database**
   - Name: `arvoredo`
3. Clique em **Save**

---

## Passo 2: Clonar o Repositório

Abra o terminal (PowerShell) e execute:

```bash
cd C:\
git clone https://github.com/seu-repositorio/Arvoredo.git ArvoredoWEB
cd ArvoredoWEB
```

---

## Passo 3: Criar Arquivo .env

Na pasta raiz do projeto, crie o arquivo `.env`:

```env
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/arvoredo
PORT=8080
```

**Substitua `SUA_SENHA` pela senha do seu PostgreSQL.**

---

## Passo 4: Instalar Dependências

```bash
pnpm install
```

---

## Passo 5: Iniciar o Sistema

```bash
pnpm dev
```

Ou use o script batch:

```bash
.\start_arvoredo.bat
```

---

## Verificação

Após iniciar, abra o navegador:

- Frontend: http://localhost:5173
- API: http://localhost:8080/api/produtos (deve mostrar os produtos)

---

## Troubleshooting

### API não conecta / produtos não aparecem

Verifique se o `.env` está correto:

```bash
type .env
```

### Erro "tsx não reconhecido"

Execute:

```bash
pnpm install
```

### Banco não tem tabelas

Verifique se o nome do banco em `DATABASE_URL` é o mesmo que criou no pgAdmin.

---

## Resumo de Comandos

```bash
# Clone (primeira vez)
git clone https://github.com/seu-repositorio/Arvoredo.git ArvoredoWEB
cd ArvoredoWEB

# Criar .env com suas configurações
# ... 编辑 .env ...

# Instalação
pnpm install

# Iniciar
pnpm dev
```

---

## Após Atualizações (git pull)

 Se já tem o projeto instalado e quer atualizar:

```bash
git pull
pnpm install
pnpm dev
```

O `.env` já deve estar configurado (não é apagado pelo git pull).