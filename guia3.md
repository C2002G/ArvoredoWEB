# Guia 3 - Pos Pull / Pos Mudanca Local

Este guia e para executar sempre que voce:
- fizer `git pull`;
- ou alterar codigo localmente e quiser validar antes de seguir.

O fluxo esta dividido em 3 etapas: **desenvolvimento**, **teste** e **producao**.

---

## 1) Desenvolvimento (sua maquina)

Use esta sequencia apos atualizar o codigo ou terminar uma alteracao local.

### 1.1 Comandos base

```bash
git pull
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/arvoredo run typecheck
pnpm --filter @workspace/api-server run build
git
```

### 1.2 O que cada comando faz

- `git pull`  
  Atualiza seu codigo local com o que esta no repositorio remoto.

- `pnpm install`  
  Instala e sincroniza dependencias do workspace conforme `pnpm-lock.yaml`.

- `pnpm --filter @workspace/db run push`  
  Aplica o schema atual no banco local via Drizzle (`drizzle-kit push`).  
  Use quando houver mudancas de schema ou quando estiver em duvida.

- `pnpm --filter @workspace/api-server run typecheck`  
  Valida tipos TypeScript do backend sem gerar build.

- `pnpm --filter @workspace/arvoredo run typecheck`  
  Valida tipos TypeScript do frontend sem gerar build.

- `pnpm --filter @workspace/api-server run build`  
  Gera build de producao do backend e valida empacotamento.

- `pnpm --filter @workspace/arvoredo run build`  
  Gera build de producao do frontend e valida empacotamento.

### 1.3 Subir sistema local

PowerShell (na raiz do projeto):

```powershell
./deployment/iniciar.ps1
```

Esse script sobe API + frontend, configura variaveis de ambiente e abre o sistema.

### 1.4 Verificacoes rapidas

- API responde em `http://localhost:8080/api/healthz`
- Frontend abre em `http://localhost:5173`
- Venda de teste conclui sem erro
- Se NFC-e estiver ativa: status autorizado em historico
- Impressao ocorre conforme esperado (DANFE ou cupom simples)

---

## 2) Teste (PC de homologacao)

Mesma base do desenvolvimento, com foco em validar fluxo ponta a ponta.

### 2.1 Comandos

```bash
git pull
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/arvoredo run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/arvoredo run build
```

Depois iniciar:

```powershell
./deployment/iniciar.ps1
```

### 2.2 Verificacoes obrigatorias

- Confirmar `config_fiscal.ambiente = homologacao`
- Confirmar UniNFe em homologacao
- Emitir pelo menos 1 venda de teste
- Testar uma venda com falha de NFC-e para validar fallback
- Validar reimpressao:
  - com XML autorizado => DANFE
  - sem XML autorizado => cupom simples
- Validar mensagem de erro JSON (sem tela HTML 500) em importacao com dado invalido

---

## 3) Producao (estabelecimento)

Use este fluxo com cuidado e preferencialmente fora do horario de pico.

### 3.1 Antes de atualizar

- Fazer backup do banco
- Confirmar que nao ha operacao de caixa critica em andamento
- Garantir que UniNFe esta operacional

### 3.2 Comandos recomendados

```bash
git pull
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/arvoredo run build
```

Opcional (fortemente recomendado se houver mudanca maior):

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/arvoredo run typecheck
```

Iniciar/reiniciar sistema:

```powershell
./deployment/iniciar.ps1
```

### 3.3 Verificacoes de producao

- API e frontend online
- `config_fiscal.ambiente = producao`
- UniNFe em producao com certificado valido
- Emissao real de baixo risco autorizada
- DANFE/QR Code impressos corretamente
- Reimpressao funcionando no historico

---

## Comandos extras uteis

- `pnpm run typecheck`  
  Roda typecheck geral do workspace (libs + apps).

- `pnpm run build`  
  Roda build recursivo no workspace inteiro.

- `pnpm --filter @workspace/db run push-force`  
  Forca aplicacao de schema no banco.  
  **Use apenas com cautela**, pois pode aplicar alteracoes destrutivas dependendo do diff.

---

## Sequencia curta (cola rapida)

### Pos `git pull` (padrao)

```bash
git pull
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
./deployment/iniciar.ps1
```

### Pos mudanca local (antes de commit/uso)

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/arvoredo run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/arvoredo run build
```
