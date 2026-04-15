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
- instala dependencias
- cria banco `arvoredo` se necessario
- executa `db push`
- cria `.env`

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

## 9) Checklist operacional
- PostgreSQL rodando no Windows
- `.env` presente com `DATABASE_URL` correto
- API responde `/api/healthz`
- Frontend abre em `5173`
- Backup diario habilitado
