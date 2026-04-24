# Comandos após um `git pull` (e dia a dia)

Use este roteiro no **PC de desenvolvimento**, no **teste (homologação)** e no **estabelecimento (produção)**. Ajuste caminhos se o repositório não estiver no mesmo local.

## Pré-requisitos

- **Node.js** (LTS) e **pnpm** global (`npm i -g pnpm`).
- **PostgreSQL** acessível e banco criado.
- Arquivo **`.env`** na raiz do repositório (copie de `.env.example` e preencha `DATABASE_URL`, `PORT`, e no PDV/Windows `PRINTER_NAME` se for imprimir).

## 1) Depois de cada pull

Na raiz do repositório:

```bash
pnpm install
pnpm run typecheck
```

Se alterou o schema do Drizzle (raro) ou tabelas manuais, rode o SQL em `deployment/SQL/` que ainda não foi aplicado no banco; o **API** também aplica `ALTER TABLE itens_venda ... unidades` na **subida do servidor** (migração de startup), mas manter o SQL no deploy documentado ajuda em auditoria.

## 2) Desenvolvimento (máquina do dev)

```bash
# variáveis: copiar .env.example -> .env e apontar DATABASE_URL

# API (em um terminal)
cd artifacts/api-server
pnpm dev
# (ou: node / tsx conforme o script no package.json do api-server)

# Front PDV (em outro terminal)
cd artifacts/arvoredo
pnpm dev
```

Confirme `PORT` no `.env` (ex.: API `8080`, front geralmente outra porta; o front aponta para a URL da API).

## 3) Teste / homologação

- Mesmos passos de instalação e `typecheck`.
- Alimente `.env` com **banco de teste** (nunca a mesma URL de produção, se puder).
- Sobe **API** e **front** como no item 2.
- Impressão no Windows: confira `PRINTER_NAME` e, só se o cupom sair anormal, `PRINTER_LINE_WIDTH` (veja comentário no `.env.example`).

## 4) Estabelecimento (produção)

- Fazer `pull` em horário seguro, `pnpm install`, aplicar **SQLs pendentes** de `deployment/SQL/`.
- Atualizar `.env` (segredo de banco, `PORT`, `PRINTER_NAME`).
- Rebuild e reiniciar o processo servindo a API (PM2, NSSM, tarefa agendada, etc., conforme vocês usarem no local).
- Front: rebuild estático e copiar `dist` para o servidor, ou o fluxo que vocês já adotam.

## 5) Banco (referência)

- Migrations de startup na API: coluna `itens_venda.unidades` é criada automaticamente se ainda não existir.
- Scripts em `deployment/SQL/`: continuar versionando e rodando o que ainda não foi aplicado em cada ambiente.

## 6) Checklist rápido pós-pull

- [ ] `pnpm install`
- [ ] `pnpm run typecheck`
- [ ] SQLs novos em `deployment/SQL/` aplicados onde ainda faltam
- [ ] `.env` coerente com o ambiente
- [ ] API sobe sem erro (log mostra "Migrações de startup OK" e "Server listening")
- [ ] Teste: registrar uma venda e imprimir cupom (se for o caso no PC)

## 7) Problemas comuns

- **500 ao finalizar venda, insert em itens_venda / unidades**  
  Suba a **API** após o pull: a migração de startup cria a coluna. Se o Postgres estiver muito antigo e falhar, rode manualmente o script `deployment/SQL/2026-04-24-itens-venda-unidades.sql`.
- **Cupom “pela metade” da largura**  
  Não defina `PRINTER_LINE_WIDTH` a menos que precise forçar; a orientação correta é no driver Windows da impressora. Ajuste no `.env` só em último caso.
