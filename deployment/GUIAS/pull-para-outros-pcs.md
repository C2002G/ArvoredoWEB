# Pull para outros PCs (dev, teste e estabelecimento)

## Objetivo
Este guia explica como abrir o sistema:
- no **PC de desenvolvimento** agora;
- no **PC de teste** e no **PC do estabelecimento** depois do `git pull`;
- e quando pode voltar a abrir apenas clicando em `start_arvoredo.bat`.

---

## 1) PC de desenvolvimento (agora)

Na raiz do projeto:

1. Atualize branch e dependencias (depois do seu commit/push):
   - `git pull`
   - `pnpm install`

2. Aplique o SQL da nova categoria Feira (uma vez por banco):
   - Arquivo: `deployment/SQL/2026-04-24-add-categoria-feira.sql`
   - Execute no banco `arvoredo`.

3. Garanta o `.env` com `DATABASE_URL` valido (raiz do projeto).

4. Inicie:
   - modo script completo: `.\deployment\iniciar.ps1`
   - ou clique no atalho: `start_arvoredo.bat`

5. Teste rapido:
   - `http://localhost:5173`
   - Impressora: tela Dispositivos > Testar Impressao
   - PDV: pagamento parcial e item de feira por peso.

---

## 2) PC de teste e PC do estabelecimento (depois do pull)

### Primeira vez nesse PC (obrigatorio)
1. Clonar/abrir repositorio.
2. Rodar:
   - `.\deployment\instalar-dependencias.ps1`
   - `.\deployment\configurar-sistema.ps1 -PgPassword "SUA_SENHA"`
3. Configurar `.env` com `DATABASE_URL` correto.
4. Rodar SQL da Feira no banco desse PC:
   - `deployment/SQL/2026-04-24-add-categoria-feira.sql`

### Atualizacoes futuras (rotina)
1. Rodar:
   - `.\deployment\atualizar.ps1 -PgPassword "SUA_SENHA"`
2. Depois iniciar normalmente:
   - `start_arvoredo.bat`

> Observacao: `atualizar.ps1` ja faz `git fetch/pull`, `pnpm install`, `db push` e build quando necessario.

---

## 3) Posso abrir depois so pelo start_arvoredo.bat?

**Sim**, depois da configuracao inicial e com ambiente correto.

Para funcionar sempre no clique:
- PostgreSQL precisa estar instalado e funcionando;
- `.env` precisa estar correto (principalmente `DATABASE_URL`);
- scripts e dependencias ja precisam ter sido instalados ao menos uma vez;
- para esta versao, o banco precisa ja ter recebido o SQL da categoria `feira`.

Se isso estiver ok, o fluxo diario pode ser somente:
- clicar em `start_arvoredo.bat`.

---

## 4) Checklist de rollout recomendado

1. Commit/push no dev.
2. Atualizar PC de teste (`atualizar.ps1`), validar operacao completa.
3. Atualizar PC do estabelecimento (`atualizar.ps1`).
4. Confirmar:
   - impressao vertical com folga final;
   - pagamento dividido;
   - venda por peso na Feira.
