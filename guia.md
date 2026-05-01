# Guia de Atualizacao e Operacao Fiscal (UniNFe)

Este guia cobre:
- como atualizar via `git pull` em **desenvolvimento**, **PC de teste** e **estabelecimento (producao)**;
- o que configurar para emissao NFC-e via **UniNFe**;
- onde alterar **homologacao x producao**;
- checklist de validacao;
- melhorias futuras (docker, escalabilidade e robustez).

## 1) O que mudou no sistema

- A emissao fiscal passou a usar o padrao de pastas do UniNFe:
  - grava XML em `.../<CNPJ>/Envio`
  - aguarda resposta em `.../<CNPJ>/Retorno`
- O servico fiscal agora gera a chave de acesso, monta XML e processa retorno do UniNFe.
- Dependencia `node-dfe` foi removida do `api-server`.

## 2) Procedimento padrao apos `git pull` (qualquer ambiente)

No diretorio raiz do projeto:

1. Atualizar codigo:
   - `git pull`
2. Atualizar dependencias:
   - `pnpm install`
3. Validar compilacao:
   - `pnpm --filter @workspace/api-server run typecheck`
   - `pnpm --filter @workspace/api-server run build`
4. Reiniciar servicos do sistema (backend/frontend e UniNFe se aplicavel).

Se houver mudanca de schema/migration no futuro, incluir tambem o comando de migration antes de subir.

## 3) Pre-requisitos por maquina

## 3.1 Desenvolvimento (seu PC)

- Node e pnpm instalados (versoes compativeis com o projeto).
- Banco Postgres acessivel pela `DATABASE_URL`.
- UniNFe instalado e funcionando.
- Certificado A1 valido.
- Impressora termica instalada (se for testar impressao local).

## 3.2 PC de teste

- Mesmo checklist do desenvolvimento.
- Preferencia: certificado e dados dedicados de homologacao.
- Confirmar que o caminho do UniNFe existe e permite escrita.

## 3.3 Estabelecimento (producao)

- UniNFe instalado como servico/processo estavel.
- Certificado A1 oficial da empresa.
- CSC de producao correto.
- Backup de banco e plano de rollback antes de atualizar.

## 4) Configuracoes obrigatorias

## 4.1 Variaveis de ambiente (`.env`)

Minimo necessario:

- `DATABASE_URL`
- `PORT`
- `UNINFE_DIR` (recomendado definir explicitamente)
  - Exemplo: `UNINFE_DIR=C:\\UniNFe`
- Impressao (opcional/necessario conforme ambiente):
  - `PRINTER_NAME` ou `PRINTER_VID`/`PRINTER_PID`

Observacao:
- O codigo usa por padrao `C:\\UniNFe` caso `UNINFE_DIR` nao esteja definido.
- Evite versionar senha/caminho de certificado no `.env` do repositorio.

## 4.2 Configuracao fiscal no banco (`config_fiscal`)

A emissao depende dos campos em `config_fiscal`, principalmente:

- dados do emitente (`razao_social`, `cnpj`, `ie`, endereco);
- `crt`, `cod_municipio`;
- `csc_id` e `csc_token`;
- `caminho_certificado` e `senha_certificado`;
- `ambiente` (`homologacao` ou `producao`).

## 4.3 UniNFe

No UniNFe, garantir:

- empresa/CNPJ configurado corretamente;
- certificado A1 associado;
- ambiente correspondente ao desejado;
- monitoramento das pastas `Envio` e `Retorno` para o CNPJ;
- permissao de leitura/escrita nas pastas.

## 5) Onde trocar Homologacao x Producao

Trocar em **todos** os pontos abaixo:

1. **Sistema (banco / config fiscal)**  
   Campo `config_fiscal.ambiente`:
   - `homologacao` => SEFAZ ambiente 2
   - `producao` => SEFAZ ambiente 1

2. **UniNFe**  
   Ambiente da empresa no UniNFe deve coincidir com o ambiente acima.

3. **Credenciais fiscais**
   - CSC ID/TOKEN corretos para o ambiente.
   - Certificado valido para o CNPJ emissor.

4. **Dados operacionais**
   - Em homologacao, usar fluxo de testes.
   - Em producao, validar numeracao, serie, regras fiscais e contingencia.

Importante:
- Nao basta trocar so `.env`.
- O ponto principal do ambiente no codigo atual e `config_fiscal.ambiente` + configuracao equivalente no UniNFe.

## 6) Checklist rapido por ambiente

## 6.1 Desenvolvimento

- [ ] `git pull`
- [ ] `pnpm install`
- [ ] `pnpm --filter @workspace/api-server run typecheck`
- [ ] `pnpm --filter @workspace/api-server run build`
- [ ] confirmar `UNINFE_DIR`
- [ ] confirmar CNPJ/pastas `Envio` e `Retorno`
- [ ] emitir 1 venda de teste
- [ ] verificar `nfce_logs` com status `autorizada` e XML salvo
- [ ] validar impressao DANFE simplificado

## 6.2 PC de teste

- [ ] repetir checklist de desenvolvimento
- [ ] validar ambiente `homologacao` em `config_fiscal`
- [ ] validar ambiente de homologacao no UniNFe
- [ ] testar erro controlado (ex: dado invalido) para confirmar retorno de rejeicao

## 6.3 Estabelecimento (producao)

- [ ] backup antes da atualizacao
- [ ] `git pull`
- [ ] `pnpm install`
- [ ] build/typecheck
- [ ] validar `config_fiscal.ambiente = producao`
- [ ] validar UniNFe em producao
- [ ] validar CSC/certificado de producao
- [ ] emitir venda real de baixo risco
- [ ] conferir autorizacao e impressao no caixa

## 7) Sobre a impressao (ponto que falta fechar)

O fluxo atual ja retorna:
- XML autorizado;
- chave de acesso;
- URL do QR Code extraida do XML de retorno.

Para estabilizar impressao no RS:

- garantir que a impressora USB esteja correta (`PRINTER_VID`/`PRINTER_PID`);
- validar layout de DANFE simplificado em bobina real;
- incluir fallback de reimpressao a partir do `xml_autorizado` salvo;
- registrar falhas de impressao separadas das falhas de autorizacao.

## 8) Melhorias futuras recomendadas

## 8.1 Infraestrutura e deploy

- **Dockerizar** backend + frontend + banco (ou banco gerenciado) para padronizar ambientes.
- Criar `docker-compose` para ambiente de teste local.
- Padronizar script de deploy (pull, install, build, restart, health-check).

## 8.2 Confiabilidade fiscal

- Worker/fila para emissao fiscal (evita bloquear fluxo de venda).
- Retentativas com backoff no polling de retorno do UniNFe.
- Job de reconciliacao para notas "processando" pendentes.
- Alertas para notas com erro/rejeicao.

## 8.3 Observabilidade

- Dashboard de `nfce_logs` (status por periodo, taxa de erro, tempo medio).
- Correlation ID por venda/emissao.
- Logs estruturados com motivo de rejeicao e contexto.

## 8.4 Seguranca

- Remover segredos de `.env` versionado.
- Usar cofre de segredos/variaveis protegidas por ambiente.
- Rotacionar senha/certificado quando necessario.

## 8.5 Escalabilidade

- Separar servico fiscal em modulo/processo dedicado.
- Cache de configuracao fiscal com invalidacao controlada.
- Preparar multiponto de venda (mais de um caixa simultaneo) com controle de concorrencia.

## 9) Plano de validacao final (recomendado)

1. Validar ponta a ponta em desenvolvimento (homologacao).
2. Repetir no PC de teste com checklist completo.
3. Executar virada assistida para producao no estabelecimento.
4. Monitorar primeiras emissões e impressões com log aberto.

Se quiser, o proximo passo pode ser criar um script unico de atualizacao (ex: `update-and-validate.bat`) para reduzir erro operacional nos 3 ambientes.
