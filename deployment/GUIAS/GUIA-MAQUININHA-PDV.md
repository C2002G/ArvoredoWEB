# Guia de Integracao de Maquininha no PDV

Este guia foi feito para mercado/lancheria com foco em operacao simples.

## 1) Como funciona no mercado (vida real)

Existem 3 modelos comuns:

1. **Manual (sem integracao direta)**  
   O operador digita o valor na maquininha, cliente paga, e depois confirma no sistema.
   - Mais simples de manter.
   - Menos automatizacao.
   - Menos risco tecnico.

2. **Integracao por API/Gateway (mais moderno)**  
   O PDV envia valor e dados do pedido para um servico (gateway/TEF cloud/API do adquirente).
   - Fluxo mais rapido e com menos erro de digitacao.
   - Precisa de fornecedor que exponha API.
   - Normalmente exige homologacao.

3. **Integracao local (USB/serial com bridge/TEF)**  
   O PDV conversa com software local (bridge) que conversa com a maquininha.
   - Muito usado com TEF tradicional.
   - Funciona mesmo sem API publica direta da maquininha.
   - Exige instalacao e manutencao local.

## 2) API ou USB: qual escolher?

- **Sem saber a marca da maquininha:** comece em **modo manual** ou **modo bridge local**.
- **Se a empresa de pagamento tiver API oficial:** use **modo API**.
- **Se a automacao/fornecedor usar TEF local:** use **modo USB com bridge** (o PDV chama o bridge).

## 3) O que foi implementado no sistema

Foi criada uma integracao generica de maquininha:

- Tela `Dispositivos` com configuracao:
  - Ativo (sim/nao)
  - Modo (`manual`, `api`, `usb_bridge`)
  - URL API/Gateway
  - Token (opcional)
  - Timeout
  - Nome/CNPJ/regras da empresa (padrao editavel)
- No `PDV`, pagamento com:
  - **Debito**
  - **Credito**
  - **PIX**
- Ao clicar em debito/credito/pix:
  - O sistema envia automaticamente valor total + itens do carrinho para a integracao.
  - Se falhar envio, a venda nao conclui.
  - A confirmacao continua manual no sistema (como voce pediu).

## 4) Fluxo operacional recomendado para seu caso

Como voce ainda nao sabe a marca:

1. Deixe `modo_conexao = manual`.
2. Teste o fluxo no PDV com debito/credito/pix.
3. Quando descobrir o fornecedor:
   - Se tiver API: preencha URL/token e mude para `api`.
   - Se for TEF local: mude para `usb_bridge` e aponte para o bridge local.
4. Mantenha confirmacao manual de pagamento ate ter confianca na integracao.

## 5) Integracao em tempo real: o que significa

Em tempo real quer dizer:

- Cliente escolhe forma de pagamento.
- PDV envia os dados no mesmo instante para o gateway/bridge.
- Operador executa/aprova na maquininha.
- (No seu fluxo atual) operador confirma manualmente a venda no sistema.

Importante: nem toda maquininha devolve retorno rico para o PDV sem contrato/homologacao.

## 6) Vale a pena estoque na maquininha?

**Nao.**  
O ideal e manter estoque e cadastro de produtos no PDV (seu sistema).  
A maquininha deve ficar focada em pagamento.

## 7) Dados minimos que normalmente sao enviados

- Valor total
- Tipo de pagamento (debito/credito/pix)
- Identificador local da venda
- Lista de itens (nome, quantidade, preco)
- Dados da empresa (nome/cnpj/regra), quando necessario

## 8) Cuidados para producao

- Sempre testar com valores pequenos.
- Garantir internet estavel (modo API).
- Definir rotina de contingencia (manual) quando API/bridge cair.
- Nao bloquear atendimento por falha de integracao.
- Registrar logs de tentativa de envio.

## 9) Proximo passo quando voce souber a marca

Com a marca e fornecedor em maos, voce valida:

- Existe API oficial?
- Existe middleware/bridge homologado?
- Exige TEF de terceiro?
- Qual formato de payload e autenticacao?
- Como tratar estorno/cancelamento?

Depois disso, ajustamos este modulo para a especificacao oficial do fornecedor.
