# Guia: features adicionais e atualização segura no estabelecimento

Este documento complementa o [GUIA-ESTABELECIMENTO.md](GUIA-ESTABELECIMENTO.md). Use-o quando o repositório ganhar novas funcionalidades (PDV, comandas, produtos, caixa, etc.) e você quiser **atualizar sem perder dados** e **sem “zerar” o banco**.

## O que este guia não faz

- Não substitui backup: continue usando o backup descrito no guia principal.
- Não pede para apagar o PostgreSQL, o banco `arvoredo`, nem o arquivo `.env`.

## Fluxo recomendado após `git pull`

Checklist completo (parar, pull, install, Drizzle, build, iniciar): [GUIA-ATUALIZACOES.md](GUIA-ATUALIZACOES.md).

1. **Parar o sistema** (se estiver rodando), com o script de parada que você já usa.
2. **Atualizar o código** (no PC da loja, pasta do projeto, exemplo `C:\Arvoredo`):
   ```powershell
   cd C:\Arvoredo
   git pull
   ```
   Ou use o script de atualização do projeto, se aplicável: `.\deployment\atualizar.ps1` (veja a seção 8 do guia de estabelecimento).

3. **Dependências**: se houver mudanças em `package.json` ou na primeira vez após muito tempo sem atualizar:
   ```powershell
   pnpm install
   ```

4. **Banco de dados (quando o código trouxer colunas ou tabelas novas)**  
   O projeto usa Drizzle com `db push`, o mesmo tipo de passo da instalação inicial: isso **aplica alterações incrementais** ao schema (por exemplo, novos campos em `produtos`) **sem apagar** os dados existentes, desde que o comando seja o `push` padrão e não opções destrutivas.

   Com `DATABASE_URL` disponível (normalmente carregada do `.env` na raiz do projeto):
   ```powershell
   cd C:\Arvoredo
   pnpm --filter @workspace/db push
   ```

   Se o PowerShell não propagar o `.env`, defina `DATABASE_URL` como no seu `.env` (mesma string usada pela API) e rode o comando acima de novo.

5. **Build** (se o seu fluxo de atualização incluir build de produção):
   ```powershell
   pnpm run build
   ```

6. **Iniciar** API e frontend como de costume, por exemplo:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\deployment\iniciar.ps1
   ```

## Por que rodar `db push` depois de algumas atualizações?

Novas versões podem incluir campos no schema (ex.: validade de produto). O aplicativo e a API passam a **esperar** essas colunas; sincronizar o banco com `pnpm --filter @workspace/db push` evita erros em tempo de execução **sem** recriar o banco do zero.

## Checklist rápido

- [ ] `git pull` (ou script de atualização) concluído sem conflitos graves.
- [ ] `pnpm install` quando necessário.
- [ ] `pnpm --filter @workspace/db push` quando a release mencionar mudança de banco ou após erro relacionado a coluna/tabela inexistente.
- [ ] `.env` intacto com `DATABASE_URL` correto.
- [ ] Sistema iniciado e `/api/healthz` respondendo (veja o guia principal).

## Em caso de dúvida

Prefira **backup antes** de qualquer operação incomum no banco. Em ambiente de loja, evite comandos manuais de “drop database” ou exclusão de tabelas; o fluxo oficial é pull → dependências → `db push` quando aplicável → subir serviços.
