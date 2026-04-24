# Guia de Instalacao no PC do Estabelecimento

Objetivo: deixar o sistema rodando localmente no PC da loja, sem hospedagem externa.

## 1) Pre requisitos
- PostgreSQL instalado (senha do usuario `postgres` anotada)
- Node.js LTS (22+)
- pnpm
- Git (somente se for atualizar por `git pull`)

## 2) Instalar codigo no PC da loja
Exemplo em `C:\Arvoredo`:
```powershell
cd C:\
git clone https://github.com/C2002G/ArvoredoWEB.git Arvoredo
cd C:\Arvoredo
```

## 3) Instalacao inicial (uma vez)
```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\instalacao-completa.ps1
```

O script:
- valida PostgreSQL
- instala dependencias (inclui `pnpm install` e `pnpm add -w xlsx pg` para backup Excel)
- cria banco `arvoredo` se necessario
- executa `db push`
- cria `.env`

Se fizer instalacao manual (sem o script), rode:
```powershell
pnpm install
```

## 4) Abrir sistema no dia a dia
```powershell
cd C:\Arvoredo
powershell -ExecutionPolicy Bypass -File .\deployment\iniciar.ps1
```

## 5) Fechar sistema
```powershell
cd C:\Arvoredo
powershell -ExecutionPolicy Bypass -File .\deployment\parar.ps1
```

## 6) URLs locais
- Frontend: http://localhost:5173
- API health: http://localhost:8080/api/healthz

## 7) Backup
Manual:
```powershell
cd C:\Arvoredo
powershell -ExecutionPolicy Bypass -File .\deployment\backup-excel.ps1 -OpenAfter
```

Automatico diario (Task Scheduler):
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Arvoredo\deployment\backup-diario.ps1"
```

## 8) Atualizacao do sistema
```powershell
cd C:\Arvoredo
powershell -ExecutionPolicy Bypass -File .\deployment\atualizar.ps1
```

Detalhe do que fazer em cada atualização (Git, `pnpm`, banco Drizzle, parar/iniciar): veja o [GUIA-ATUALIZACOES.md](GUIA-ATUALIZACOES.md).

## 9) Checklist operacional
- PostgreSQL rodando no Windows
- `.env` presente com `DATABASE_URL` correto
- API responde `/api/healthz`
- Frontend abre em `5173`
- Backup diario habilitado

## 10) Solucao rapida de problemas comuns
Erro `'vite' nao e reconhecido` ou aviso `node_modules missing`:
```powershell
cd C:\Arvoredo
pnpm install
powershell -ExecutionPolicy Bypass -File .\deployment\iniciar.ps1
```

Aviso do PowerShell `NativeCommandError` com texto `npm warn` durante instalacao:
- normalmente e so aviso no stderr; o instalador agora usa `pnpm` para `xlsx`/`pg`.
- se a instalacao parar mesmo assim, rode `pnpm install` manualmente e depois o script novamente.

Aviso `WARN Issues with peer dependencies` do pnpm:
- em geral nao impede o sistema de subir; se `pnpm install` termina com sucesso, pode seguir.

Teste rapido da API:
```powershell
Invoke-WebRequest http://localhost:8080/api/healthz
```

Se nao retornar `StatusCode 200`, abra os logs:
```powershell
Get-Content .\Logs\api-*.log -Tail 80
Get-Content .\Logs\frontend-*.log -Tail 80
```
