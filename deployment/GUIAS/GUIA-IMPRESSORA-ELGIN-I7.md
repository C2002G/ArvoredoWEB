# Guia de Conexão da Impressora Elgin i7plus para Arvoredo

## Objetivo
Este guia descreve como conectar e testar a impressora térmica Elgin i7plus no sistema Arvoredo usando o backend `artifacts/api-server`.

## O que foi implementado
- Novo backend `POST /api/impressora/teste` para testar a impressora.
- Novo backend `POST /api/impressora/cupom` para imprimir cupom fiscal de uma venda.
- Novo backend `POST /api/impressora/sangria` para imprimir relatório de sangria.
- Impressão via PowerShell usando `Out-Printer` no Windows.
- Uso de `PRINTER_NAME` no `.env` para indicar o nome exato da impressora instalada.

## Requisitos
- Windows 10/11
- Impressora Elgin i7 instalada no Windows e acessível como impressora de sistema
- Driver de impressora instalado e funcionando
- Backend `api-server` rodando no Windows

## Configuração necessária
1. Abra o PowerShell e verifique as impressoras instaladas:

```powershell
Get-Printer | Select-Object Name,Default
```

2. Copie o nome exato da impressora Elgin i7 do resultado.

3. No arquivo `.env` do backend, defina a variável:

```env
PRINTER_NAME=Nome da sua impressora Elgin i7
```

4. Se `PRINTER_NAME` não for definido, o backend tentará usar a impressora padrão do Windows.

## Como usar
### Rodar o backend
No workspace principal execute:

```powershell
pnpm --filter @workspace/api-server run dev
```

### Testar a conexão da impressora
- Use a tela de dispositivos no frontend Arvoredo.
- Ou faça requisição `POST /api/impressora/teste` diretamente.

Se a impressora estiver correta, ela deve imprimir um cupom de teste simples.

### Imprimir cupom de venda
- A API recebe o body esperado por `ImprimirCupomBody`.
- Ela busca a venda e os itens no banco e imprime o texto formatado.

### Imprimir sangria
- A API recebe o body esperado por `ImprimirSangriaBody`.
- Ela busca vendas e sangrias no período informado e imprime o relatório.

## Mensagens de erro comuns
- `Impressora configurada não encontrada`: o nome em `PRINTER_NAME` está errado.
- `Nenhuma impressora padrão encontrada`: não há impressora padrão no Windows e `PRINTER_NAME` não foi definido.
- `Erro desconhecido ao testar impressora`: revise a instalação do driver e a conectividade USB.

## Dicas
- Use o nome exato exibido pelo PowerShell; diferencia maiúsculas de minúsculas não importa, mas espaços e caracteres especiais importam.
- Se precisar confirmar o nome, execute novamente:

```powershell
Get-Printer | Select-Object Name,Default
```

- Para reduzir problemas de impressão, verifique se a impressora está online e sem trabalhos na fila.

## Observações técnicas
- A impressão é enviada como texto simples para o spooler do Windows via `Out-Printer`.
- O Elgin i7 deve estar instalado como impressora no Windows, não necessariamente conectado diretamente via USB na aplicação.
- A largura de impressão atual é configurada como `48` colunas no código.

## Caminho do código
- `artifacts/api-server/src/routes/impressora.ts`
- `artifacts/api-server/src/lib/printer.ts`
- `.env.example`
