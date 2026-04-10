# Guia de Instalação - PC do Estabelecimento

Este guia é para instalar o sistema no PC da **dona do estabelecimento**.

---

## Pré-requisitos Já Instalados

- PostgreSQL 18 ✅ (já instalado)
- Git ✅ (precisa verificar se está instalado)
- Node.js ✅ (precisa verificar se está instalado)

---

## PASSO 1: Verificar se Git e Node estão instalados

Abra o **PowerShell como Administrador** e execute:

```powershell
git --version
node -v
pnpm -v
```

Se algum não estiver instalado, baixe e instale:
- Git: https://git-scm.com/download/win
- Node.js: https://nodejs.org (escolha LTS)

---

## PASSO 2: Clonar o Repositório

No PowerShell como Administrador:

```powershell
cd C:\
git clone https://github.com/C2002G/ArvoredoWEB.git
```

---

## PASSO 3: Executar a Instalação Completa

```powershell
cd C:\Arvoredo
powershell -ExecutionPolicy Bypass -File .\deployment\instalacao-completa.ps1
```

**O script vai pedir:**
- A senha do PostgreSQL (a mesma do pgAdmin, ex: 1234)

**O script vai fazer:**
- Criar o banco de dados "arvoredo"
- Criar as tabelas
- Instalar dependências
- Configurar tudo automaticamente

---

## PASSO 4: Iniciar o Sistema (Todo Dia)

```powershell
cd C:\Arvoredo
powershell -ExecutionPolicy Bypass -File .\deployment\iniciar.ps1
```

Digite a senha quando pedir (ex: 1234)

O navegador vai abrir automaticamente em **http://localhost:5173**

---

## PASSO 5: Fazer Backup Excel (Todo Dia)

```powershell
cd C:\Arvoredo
powershell -ExecutionPolicy Bypass -File .\deployment\backup-excel.ps1 -OpenAfter
```

O arquivo será salvo em: **C:\Arvoredo\Backups\**

---

## PASSO 6: Atualizar o Sistema

Quando você enviar atualizações do seu PC de desenvolvimento:

```powershell
cd C:\Arvoredo
git pull
powershell -ExecutionPolicy Bypass -File .\deployment\atualizar.ps1
```

---

## Comandos do Dia a Dia

| Ação | Comando |
|------|---------|
| **Abrir sistema** | `cd C:\Arvoredo` → `powershell -ExecutionPolicy Bypass -File .\deployment\iniciar.ps1` |
| **Fazer backup** | `cd C:\Arvoredo` → `powershell -ExecutionPolicy Bypass -File .\deployment\backup-excel.ps1 -OpenAfter` |
| **Atualizar** | `cd C:\Arvoredo` → `git pull` → `powershell -ExecutionPolicy Bypass -File .\deployment\atualizar.ps1` |
| **Parar sistema** | `cd C:\Arvoredo` → `powershell -ExecutionPolicy Bypass -File .\deployment\parar.ps1` |

---

## URLs do Sistema

| Serviço | URL |
|---------|-----|
| **Frontend** | http://localhost:5173 |
| **API** | http://localhost:8080/api/healthz |

---

## Pasta de Arquivos

| Pasta | Conteúdo |
|-------|----------|
| `C:\Arvoredo\deployment\` | Scripts de gestão |
| `C:\Arvoredo\Backups\` | Relatórios Excel |
| `C:\Arvoredo\Logs\` | Logs do sistema |
| `C:\Arvoredo\.env` | Configurações |

---

## Problemas Comuns

### "PostgreSQL não encontrado"
- Verifique se o PostgreSQL está instalado
- Abra o pgAdmin para verificar

### "Erro ao conectar no banco"
- Verifique a senha está correta
- O banco "arvoredo" existe no pgAdmin?

### "Sistema não abre"
- Verifique as URLs no navegador
- Tente http://localhost:5173
- Tente http://localhost:8080/api/healthz

---

## Suporte

Se tiver algum problema, entre em contato!