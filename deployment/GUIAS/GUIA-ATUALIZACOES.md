# Guia: atualizar o sistema após um push (dev, teste ou loja)

Este documento junta o fluxo oficial com o que aprendemos na prática (dependências, banco Drizzle, scripts). Complementa o [GUIA-ESTABELECIMENTO.md](GUIA-ESTABELECIMENTO.md) e o [GUIA-FEATURES-ADICIONAIS.md](GUIA-FEATURES-ADICIONAIS.md).

## Quem faz `git push` e quem faz `git pull`

| Onde | Ação Git típica |
|------|------------------|
| **PC de desenvolvimento** (onde você altera o código) | `git push` — envia commits para o GitHub |
| **PC de teste ou PC da loja** (onde só recebe atualização) | `git pull` — **não** use `git push` aí, a menos que saiba o que está fazendo |

Nas máquinas que **só atualizam**, o fluxo começa em **baixar** o código (`pull` ou script de atualização), não em `push`.

---

## Regra prática (checklist na loja ou no PC de teste)

1. **Parar** API e frontend (liberar portas e evitar ficheiros em uso):
   ```powershell
   cd C:\Arvoredo
   powershell -ExecutionPolicy Bypass -File .\deployment\parar.ps1
   ```
   (O ficheiro chama-se **`parar.ps1`**, não `para.ps1`.)

2. **Atualizar o código e o resto** — forma recomendada (um comando):
   ```powershell
   cd C:\Arvoredo
   powershell -ExecutionPolicy Bypass -File .\deployment\atualizar.ps1
   ```
   O script `atualizar.ps1` hoje faz, quando há novidades no Git:
   - `git fetch` / `git pull`
   - `pnpm install`
   - `pnpm --filter @workspace/db push` (sincroniza tabelas/colunas com o Drizzle — **evita erros tipo “produtos” com coluna em falta**)
   - `pnpm run build`
   - Para processos Node antes do build

   Se quiser forçar install + banco + build mesmo sem commits novos (raro):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\deployment\atualizar.ps1 -ForceRebuild
   ```

3. **Iniciar** de novo:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\deployment\iniciar.ps1
   ```
   Ou o atalho `start_arvoredo.bat` na raiz do projeto (abre o `iniciar.ps1`).

4. **Confirmar**: abrir `http://localhost:5173` e, se quiser, `http://localhost:8080/api/healthz`.

---

## Fluxo manual (equivalente ao script)

Se preferir não usar `atualizar.ps1`:

```powershell
cd C:\Arvoredo
.\deployment\parar.ps1
git pull
pnpm install
pnpm --filter @workspace/db push
pnpm run build
.\deployment\iniciar.ps1
```

- **`pnpm install`**: precisa quando mudam dependências ou o lockfile; após cada `pull` é o hábito mais seguro.
- **`pnpm --filter @workspace/db push`**: precisa quando o código traz **mudanças no schema** (novas colunas, tabelas, enums). Se não correr, a API pode falhar com “Failed query” / coluna inexistente, **sem apagar dados** no uso normal do `push`.

O ficheiro [`lib/db/drizzle.config.cjs`](../../lib/db/drizzle.config.cjs) tenta ler `DATABASE_URL` da raiz do projeto a partir do **`.env`**. No **CMD**, se correr só `pnpm --filter @workspace/db push` sem `.env` válido, defina antes:

```bat
set DATABASE_URL=postgresql://postgres:SENHA@localhost:5432/arvoredo
```

No PowerShell:

```powershell
$env:DATABASE_URL = "postgresql://postgres:SENHA@localhost:5432/arvoredo"
```

---

## Menu interativo (`deployment\menu.ps1`)

- **Opção 4 — “Atualizar Sistema (Git)”** chama o mesmo fluxo que **`atualizar.ps1`** (pull, dependências, **Drizzle push**, build).  
- **Antes**, a opção 4 fazia **apenas** `git pull`; isso **não** instalava dependências nem atualizava o banco — por isso **não** foi a “origem” do erro de produtos, mas **podia deixar** o PC nesse estado depois de um `pull` (código novo + banco velho). O problema concreto de produtos foi **schema do código à frente do schema da base** (faltava coluna, por exemplo `validade`), até correr o `db push`.

---

## No PC onde você desenvolve e faz `git push`

Ordem típica antes de enviar para o repositório:

```powershell
git add ...
git commit -m "..."
git push
```

No PC de **teste** que também usa Git para receber o mesmo repositório, o fluxo é o da loja: **`pull` + `atualizar.ps1` (ou checklist manual)**, não é obrigatório fazer `git push` aí.

---

## Resumo ultra-curto

| Passo | Onde / quando |
|--------|----------------|
| `parar.ps1` | Antes de atualizar |
| `atualizar.ps1` **ou** `pull` + `install` + `db push` + `build` | Sempre que a loja/teste recebe versão nova |
| `iniciar.ps1` ou `.bat` | Depois, para voltar a operar |

---

## Se algo falhar

- **`DATABASE_URL` / db push**: confirme que o `.env` na **raiz** do projeto tem `DATABASE_URL=...` correta (como no [GUIA-ESTABELECIMENTO.md](GUIA-ESTABELECIMENTO.md)).
- **Conflitos no `git pull`**: `git status`; resolva ou peça apoio antes de continuar.
- **Erros na API após atualizar**: muitas vezes falta **`pnpm --filter @workspace/db push`**; volte a correr `atualizar.ps1` ou esse comando à mão.
- **Backup**: antes de operações arriscadas no PostgreSQL, use o fluxo de backup do guia principal.
