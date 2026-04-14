claudecode# Guia de Desenvolvimento - Arvoredo PDV

Este guia é para **você** desenvolver e testar o sistema no seu PC.

---

## Pré-requisitos (Instale na sua máquina)

### 1. Node.js
- Baixe em: https://nodejs.org
- Escolha a versão LTS (18.x ou 20.x)
- Execute o instalador

### 2. pnpm
Abra o terminal e execute:
```powershell
npm install -g pnpm
```

### 3. PostgreSQL 18
- Baixe em: https://www.postgresql.org/download/windows/
- Execute o instalador
- **Anote a senha que você colocar** (ex: 1234)
- Escolha as opções padrão

---

## aboa
pnpm install
$env:DATABASE_URL="postgresql://postgres:1234@localhost:5432/arvoredo"
$env:PORT="8080"
pnpm --filter @workspace/db run push

    dps
powershell -ExecutionPolicy Bypass -File .\deployment\iniciar.ps1


## Pra parar
powershell -ExecutionPolicy Bypass -File .\deployment\parar.ps1

## Script para começar dnv
powershell -ExecutionPolicy Bypass -File .\deployment\iniciar.ps1


### 1. Abra o pgAdmin
- Menu Iniciar → procure "pgAdmin 4"

### 2. Crie o banco de dados
1. Clique com botão direito em **"Databases"**
2. Escolha **"Create"** → **"Database"**
3. Nome: `arvoredo`
4. Owner: `postgres`
5. Clique em **Save**

---

## Rodar o Sistema (Desenvolvimento)

### Abra o terminal na pasta do projeto:
```powershell
cd C:\Users\claud\OneDrive\Documentos\Projetos\arvoredo novo\Arvoredo
```

### Configure a senha do banco (substitua 1234 pela sua senha):
```powershell
$env:DATABASE_URL="postgresql://postgres:1234@localhost:5432/arvoredo"
```

### Instale as dependências (só na primeira vez):
```powershell
pnpm install
```

### Crie as tabelas no banco (só na primeira vez):
```powershell
pnpm --filter @workspace/db run push
```

### Inicie a API (Terminal 1):
```powershell
$env:DATABASE_URL="postgresql://postgres:1234@localhost:5432/arvoredo"
$env:PORT="8080"
pnpm --filter @workspace/api-server run dev
```

### Inicie o Frontend (Terminal 2):
```powershell
pnpm --filter @workspace/arvoredo run dev
```

### Acesse o sistema:
- http://localhost:5173

---

## Comandos Úteis

| Ação | Comando |
|------|---------|
| **Instalar dependências** | `pnpm install` |
| **Criar tabelas** | `pnpm --filter @workspace/db run push` |
| **Iniciar API** | `pnpm --filter @workspace/api-server run dev` |
| **Iniciar Frontend** | `pnpm --filter @workspace/arvoredo run dev` |
| **Buildar tudo** | `pnpm run build` |

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto para não digitar a senha toda vez:

```
DATABASE_URL=postgresql://postgres:1234@localhost:5432/arvoredo
PORT=8080
```

---

## Fluxo de Desenvolvimento

1. Faça suas alterações no código
2. Teste no seu navegador (http://localhost:5173)
3. Quando pronto, commite e push:
```powershell
git add .
git commit -m "Descrição das alterações"
git push
```

---

## Problemas Comuns

### "PostgreSQL não está rodando"
- Abra o pgAdmin e verifique se está conectado
- Ou inicie o serviço pelo "Serviços do Windows"

### "Porta já está em uso"
- Feche outros programas que usem as portas 5173 ou 8080
- Ou mate os processos node:
```powershell
Get-Process node | Stop-Process
```

### "Erro de conexão com banco"
- Verifique se a senha está correta no DATABASE_URL
- Verifique se o banco "arvoredo" existe no pgAdmin