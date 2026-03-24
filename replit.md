# Workspace

## Overview

**Arvoredo PDV** — Sistema de Ponto de Venda para mercado e lanchonete. pnpm workspace monorepo usando TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/arvoredo)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Concept — Produto com ID tipo nome

O campo `nome` do produto funciona como identificador único do produto dentro de uma mesma marca/quantidade.
- O campo `marca` diferencia produtos com o mesmo nome base.
- Exemplo: "1 Arroz" (marca: "PratoFino") e "3 Arroz" (marca: "Integral")
- Display: nome + marca juntos ex: "1 Arroz - PratoFino"

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (porta via $PORT)
│   └── arvoredo/           # React + Vite PDV frontend (porta via $PORT)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema (lib/db/src/schema/)

- `produtos` — produtos do mercado/cozinha, com campo `nome` (ID) e `marca`
- `sessoes_caixa` — sessões de caixa (abrir/fechar)
- `sangrias` — retiradas de dinheiro do caixa
- `clientes` — clientes para fiado
- `vendas` — registro de vendas
- `itens_venda` — itens de cada venda com snapshot do nome
- `fiados` — dívidas dos clientes
- `movimentos_estoque` — histórico de movimentos de estoque

## API Routes (artifacts/api-server/src/routes/)

- `GET/POST /api/produtos` — listar/criar produtos
- `GET /api/produtos/busca` — busca por código ou nome
- `GET /api/produtos/alertas` — produtos com estoque baixo
- `PUT/DELETE /api/produtos/:id` — editar/desativar produto
- `GET/POST /api/vendas` — listar/registrar vendas
- `GET /api/vendas/resumo/hoje` — resumo do dia
- `GET /api/vendas/:id/itens` — itens de uma venda
- `POST /api/estoque/movimento` — movimentar estoque
- `GET /api/estoque/movimentos` — histórico de movimentos
- `GET/POST /api/fiado/clientes` — listar/criar clientes
- `PUT /api/fiado/clientes/:id` — editar cliente
- `GET /api/fiado/clientes/:id/extrato` — extrato do cliente
- `POST /api/fiado/clientes/:id/pagar` — registrar pagamento
- `GET /api/fiado/resumo` — clientes com dívida em aberto
- `GET /api/caixa/status` — status atual do caixa
- `POST /api/caixa/abrir` — abrir sessão
- `POST /api/caixa/fechar` — fechar sessão
- `POST /api/caixa/sangria` — registrar sangria
- `GET /api/caixa/sangrias` — listar sangrias
- `GET /api/caixa/historico` — histórico de sessões

## Frontend Pages (artifacts/arvoredo/src/pages/)

1. `pdv.tsx` — PDV/Caixa com busca, grid de produtos, carrinho
2. `estoque.tsx` — Gerenciamento de estoque
3. `fiado.tsx` — Clientes e dívidas
4. `caixa.tsx` — Sessão de caixa (abrir/fechar)
5. `historico.tsx` — Histórico de vendas
6. `produtos.tsx` — Cadastro de produtos

## Root Scripts

- `pnpm run build` — builds completo
- `pnpm run typecheck` — typechecking completo
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks e schemas
- `pnpm --filter @workspace/db run push` — aplica schema no banco
