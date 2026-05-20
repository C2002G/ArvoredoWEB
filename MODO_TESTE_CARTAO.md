"# 🧪 MODO TESTE - Débito/Crédito/PIX sem TEF Real

## O Problema
Quando você tenta pagar com débito, crédito ou PIX, o sistema tenta enviar dados de cartão para a SEFAZ (`detPag > card`). Como você não tem um serviço TEF (Transferência Eletrônica de Fundos) real integrado, os dados estavam incompletos ou inválidos, causando erro:

```
O elemento 'detPag' apresenta elemento filho 'xPag' inválido. 
Lista de possíveis elementos esperados: 'dPag, CNPJPag, card'
```

## A Solução
Foi implementado um **MODO TESTE** que permite testar pagamentos com cartão usando dados padrão válidos, **mantendo toda a lógica TEF intacta para uso futuro**.

## Como Funciona

### Dados Padrão Usados (quando não há dados reais):
```
CNPJ: 16088083000155      (CNPJ do simulador Stone - substituirá quando TEF real for contratado)
Bandeira: VISA ou MASTERCARD (mapeado para códigos "01" ou "02")
Código Auth: 000000       (será preenchido pelo terminal TEF real)
Tipo: "03" (crédito) ou "04" (débito)
```

### Fluxo de Funcionamento:

1. **Frontend (arvoredo)**: Usuário clica em "Débito" ou "Crédito"
2. **API maquininha.ts**: Envia requisição ao Simulador Stone ou Terminal TEF real
3. **Simulador Stone (simulador-stone.js)**: Retorna dados de pagamento
4. **API vendas.ts**: Salva dados no banco (cnpj_credenciadora, bandeira_cartao, etc.)
5. **SEFAZ Service**: Ao gerar NF-e:
   - Se houver dados reais → usa os dados do terminal
   - Se não houver → usa dados padrão (MODO TESTE)
   - Valida bandeira (VISA → "01", MASTERCARD → "02", etc.)

## Arquivo: Função `normalizarBandeira()`

Localizada em `sefaz.service.ts`, essa função mapeia:
- Nome completo (VISA) → Código (01)
- Códigos já recebidos → passa direto
- Bandeiras não mapeadas → 99 (genérico)

**Quando contratar TEF real**: Esta função ainda será usada para garantir que bandeiras estejam no formato correto para a SEFAZ.

## Testando

### Option 1: Usar o Simulador Stone (Recomendado)
```bash
node simulador-stone.js
```

No PDV:
1. Adicione um produto
2. Clique em "Débito" ou "Crédito"
3. Aguarde ~3 segundos (simula digitação de senha)
4. Pagamento será aprovado com dados simulados

### Option 2: Modo Manual (sem simulador)
Sem o simulador, o sistema usará dados padrão diretamente, sem chamar nenhuma máquina externa.

## Dados Salvos na Venda

```typescript
{
  pagamento: "cartao",
  tipo_pagamento: "03" (crédito) ou "04" (débito),
  cnpj_credenciadora: "16088083000155", // padrão
  bandeira_cartao: "MASTERCARD" ou "VISA",
  codigo_autorizacao: "000000" ou valor real do simulador,
}
```

## Imprimindo Débito/Crédito

O recibo impresso mostrará:
```
DÉBITO/CRÉDITO
NSUA: [número da autorização]
Bandeira: VISA/MASTERCARD
Código Auth: 000000
```

## Quando Contratar um Serviço TEF Real

Você precisará:

1. **Instalar o cliente do TEF** (ex: Stone, cielo, getnet)
2. **Atualizar `maquininha.ts`**:
   - Mudar endpoint de `127.0.0.1:4000` para o IP real do terminal
   - Adicionar autenticação real se necessário
   - Remover/comentar verificação de `useStoneEmulator`

3. **Os dados reais virão preenchidos** e sobrescreverão os padrão:
   ```typescript
   cnpj_credenciadora: resultado_real_da_maquina,
   bandeira_cartao: resultado_real_da_maquina,
   codigo_autorizacao: resultado_real_da_maquina,
   ```

4. **Nenhuma mudança em `sefaz.service.ts`** será necessária:
   - A função `normalizarBandeira()` continuará validando
   - Os dados reais serão usados no lugar dos padrão

## Limpando o Modo Teste (Futura Integração Real)

Quando integrar TEF real, você pode remover:

### Em `sefaz.service.ts`:
1. A função `normalizarBandeira()` (ou deixe, ela continua útil)
2. Os comentários "MODO TESTE"
3. As linhas com dados padrão (CNPJ "16088083000155", bandeiras genéricas)

O código então ficará:
```typescript
if (venda.pagamento === "cartao") {
  result.card = {
    tpIntegra: "1",
    CNPJ: venda.cnpj_credenciadora, // agora sempre terá valor real
    tBand: normalizarBandeira(venda.bandeira_cartao),
    cAut: venda.codigo_autorizacao,
  };
}
```

## Próximos Passos

- ✅ Débito/Crédito/PIX com dados padrão funcionando
- ⏳ Testar impressão de comprovante
- ⏳ Quando integrar TEF real: apenas atualizar os endpoints e autenticação

---

**Status**: MODO TESTE ativo | TEF real: não integrado | Data: 2026-05-20
