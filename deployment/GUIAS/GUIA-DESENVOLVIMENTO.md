# Guia de Desenvolvimento Local

Este guia e para rodar o projeto no seu PC durante desenvolvimento.

## 1) Pre requisitos
- Windows 10/11
- Node.js LTS (22+)
- pnpm
- PostgreSQL instalado e rodando

## 2) Instalar ferramentas
```powershell
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
```

Se `corepack` falhar:
```powershell
npm install -g pnpm
pnpm -v
```

## 3) Preparar banco
Crie o banco `arvoredo` no PostgreSQL (pgAdmin ou psql).

Opcional com psql:
```sql
CREATE DATABASE arvoredo;
```

## 4) Configurar projeto
Na raiz do repo:
```powershell
pnpm install
```

Crie `.env` (copie de `.env.example`):
```env
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/arvoredo
PORT=8080
```

Crie/atualize tabelas:
```powershell
$env:DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/arvoredo"
pnpm --filter @workspace/db run push
```

## 5) Rodar sistema
### Opcao A: script unico
```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\iniciar.ps1
```

### Opcao B: dois terminais
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

## 6) URLs
- Frontend: http://localhost:5173
- API health: http://localhost:8080/api/healthz

## 7) Parar sistema
```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\parar.ps1
```

## 8) Problemas comuns
### Frontend nao abre (`ERR_CONNECTION_REFUSED`)
- Veja se API e frontend estao rodando.
- Confirme se porta 5173 esta livre.
- Rode:
```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\parar.ps1
powershell -ExecutionPolicy Bypass -File .\deployment\iniciar.ps1
```

### Erro de senha no PostgreSQL
- Revise `DATABASE_URL`.
- Se a senha tiver caracteres especiais, use URL encoding.

### pnpm offline/proxy invalido
Se aparecer `127.0.0.1:9` ou `offline=true`:
```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:GIT_HTTP_PROXY,Env:GIT_HTTPS_PROXY -ErrorAction SilentlyContinue
$env:NPM_CONFIG_OFFLINE="false"
pnpm install --config.confirmModulesPurge=false
```
