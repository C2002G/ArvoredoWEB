# Arvoredo PDV (Local)

Sistema PDV para rodar localmente no estabelecimento, sem hospedagem em nuvem.

## Stack
- Frontend: React + Vite (`artifacts/arvoredo`)
- API: Node + Express (`artifacts/api-server`)
- Banco: PostgreSQL + Drizzle (`lib/db`)

## Pre-requisitos (Windows)
1. Node.js LTS (22+)
2. pnpm (`corepack enable` e `corepack prepare pnpm@latest --activate`)
3. PostgreSQL instalado e rodando

## Configuração
1. Instalar dependências:
```powershell
pnpm install
```

2. Criar arquivo `.env` na raiz (baseado em `.env.example`):
```env
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/arvoredo
PORT=8080
```

3. Aplicar schema no banco:
```powershell
$env:DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/arvoredo"
pnpm --filter @workspace/db run push
```

## Rodar em desenvolvimento
### Opção 1 (script pronto)
```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\iniciar.ps1
```

### Opção 2 (manual)
Terminal 1 (API):
```powershell
$env:DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/arvoredo"
$env:PORT="8080"
pnpm --filter @workspace/api-server run dev
```

Terminal 2 (Frontend):
```powershell
$env:PORT="5173"
pnpm --filter @workspace/arvoredo run dev
```

## URLs
- Frontend: http://localhost:5173
- API healthcheck: http://localhost:8080/api/healthz

## Estrutura essencial
- `artifacts/arvoredo`: aplicação frontend
- `artifacts/api-server`: API backend
- `lib/db`: schema e conexão PostgreSQL
- `lib/api-client-react`, `lib/api-zod`, `lib/api-spec`: contratos e cliente da API
- `deployment`: scripts de execução local e operação

## Guias detalhados
- `deployment/GUIAS/GUIA-DESENVOLVIMENTO.md`
- `deployment/GUIAS/GUIA-ESTABELECIMENTO.md`
- `deployment/GUIAS/BACKUP-EXCEL.md`
