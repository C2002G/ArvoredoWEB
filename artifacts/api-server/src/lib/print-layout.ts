type CupomItem = {
  nome_snap: string;
  quantidade: number;
  preco_unit: number;
  subtotal: number;
  unidades?: number | null;
};

type CupomVenda = {
  id: number;
  criado_em: Date | string;
  total: number;
  desconto?: number | null;
  observacao?: string | null;
};

type SangriaPayload = {
  data_inicio: string;
  data_fim: string;
  sessao_id?: number | null;
};

type SangriaVenda = {
  total: number;
  pagamento: string;
};

type SangriaItem = {
  valor: number;
};

export const PRINTER_LAYOUT = {
  colunas: 48,
  empresa: {
    nome: "MERCADO ARVOREDO LTDA",
    cnpj: "60.242.783/0001-41",
    ie: "0964060779",
    endereco: "Rua CEL FERNANDO MACHADO, 453 - CENTRO HISTORICO - Porto Alegre - RS",
    telefone: "(51) 9787-4406",
  },
};

const formatMoney = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;
const drawLine = (width = PRINTER_LAYOUT.colunas) => "-".repeat(width);

function normalizeText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\r\n");
}

function padRight(value: string, size: number) {
  if (value.length >= size) return value.slice(0, size);
  return `${value}${" ".repeat(size - value.length)}`;
}

function qtdLabelFeiraUnKg(item: CupomItem) {
  const u = item.unidades != null && item.unidades > 0 ? item.unidades : 0;
  if (u > 0) {
    return padRight(`${u}un`, 8);
  }
  const isInteiro = Math.abs(item.quantidade - Math.round(item.quantidade)) < 0.0001;
  if (isInteiro) {
    return padRight(`${item.quantidade.toFixed(0)}un`, 8);
  }
  return padRight(`${item.quantidade.toFixed(3).replace(".", ",")}kg`, 8);
}

export function buildCupomText(venda: CupomVenda, itens: CupomItem[], clienteNome?: string) {
  const rows: string[] = [];
  rows.push(PRINTER_LAYOUT.empresa.nome.padStart(34));
  rows.push(`CNPJ: ${PRINTER_LAYOUT.empresa.cnpj} - IE: ${PRINTER_LAYOUT.empresa.ie}`);
  rows.push(PRINTER_LAYOUT.empresa.endereco);
  rows.push(`Telefone: ${PRINTER_LAYOUT.empresa.telefone}`);
  rows.push("Documento Auxiliar da Nota Fiscal de Consumidor Eletronica");
  rows.push(drawLine());
  rows.push("Codigo Descricao                 Qtd. Und. Vlr.Unit. Vlr.Total");
  rows.push(drawLine());

  for (const item of itens) {
    const codigo = String(item.nome_snap).slice(0, 5).padStart(5, "0");
    const descricao = padRight(String(item.nome_snap).replace(/\s+/g, " "), 25);
    const qtd = qtdLabelFeiraUnKg(item);
    rows.push(
      `${codigo} ${descricao} ${qtd} ${padRight(formatMoney(item.preco_unit), 10)} ${formatMoney(item.subtotal)}`,
    );
    const u = item.unidades != null && item.unidades > 0 ? item.unidades : 0;
    const isInteiroQtd = Math.abs(item.quantidade - Math.round(item.quantidade)) < 0.0001;
    if (u > 0) {
      rows.push(
        `   Peso: ${item.quantidade.toFixed(3).replace(".", ",")} kg x ${formatMoney(item.preco_unit)} /kg`,
      );
    } else if (!isInteiroQtd) {
      rows.push(
        `   ${item.quantidade.toFixed(3).replace(".", ",")} kg x ${formatMoney(item.preco_unit)} /kg`,
      );
    }
  }

  rows.push(drawLine());
  rows.push(`Qtd. Total de Itens ${itens.length}`);
  rows.push(`Valor Total R$ ${venda.total.toFixed(2).replace(".", ",")}`);
  if (venda.desconto && venda.desconto > 0) {
    rows.push(`Desconto R$ ${venda.desconto.toFixed(2).replace(".", ",")}`);
  }
  rows.push(drawLine());
  if (clienteNome) {
    rows.push(`Consumidor: ${clienteNome}`);
  }
  if (venda.observacao) {
    rows.push(`Obs: ${venda.observacao}`);
  }
  rows.push(`Venda #${venda.id} - ${new Date(venda.criado_em).toLocaleString("pt-BR")}`);
  rows.push(drawLine());
  rows.push("Obrigado pela preferencia!");
  rows.push("\n\n\n");

  return normalizeText(rows.join("\n"));
}

export function buildSangriaText(
  payload: SangriaPayload,
  vendas: SangriaVenda[],
  sangrias: SangriaItem[],
) {
  const rows: string[] = [];
  rows.push(PRINTER_LAYOUT.empresa.nome.padStart(34));
  rows.push("RELATORIO DE SANGRIA".padStart(30));
  rows.push(drawLine());
  rows.push(`PERIODO: ${payload.data_inicio} ate ${payload.data_fim}`);
  if (payload.sessao_id) {
    rows.push(`SESSAO: ${payload.sessao_id}`);
  }
  rows.push(drawLine());

  const totalVendas = vendas.reduce((sum, item) => sum + item.total, 0);
  const totalDinheiro = vendas
    .filter((item) => item.pagamento === "dinheiro")
    .reduce((sum, item) => sum + item.total, 0);
  const totalPix = vendas
    .filter((item) => item.pagamento === "pix")
    .reduce((sum, item) => sum + item.total, 0);
  const totalCartao = vendas
    .filter((item) => item.pagamento === "cartao")
    .reduce((sum, item) => sum + item.total, 0);
  const totalFiado = vendas
    .filter((item) => item.pagamento === "fiado")
    .reduce((sum, item) => sum + item.total, 0);
  const totalSangrias = sangrias.reduce((sum, item) => sum + item.valor, 0);

  rows.push(`Vendas: ${vendas.length}`);
  rows.push(`Total vendas: ${formatMoney(totalVendas)}`);
  rows.push(`Dinheiro: ${formatMoney(totalDinheiro)}`);
  rows.push(`PIX: ${formatMoney(totalPix)}`);
  rows.push(`Cartao: ${formatMoney(totalCartao)}`);
  rows.push(`Fiado: ${formatMoney(totalFiado)}`);
  rows.push(drawLine());
  rows.push(`Sangrias: ${sangrias.length}`);
  rows.push(`Total sangria: ${formatMoney(totalSangrias)}`);
  rows.push(drawLine());
  rows.push("Fim do relatorio");
  rows.push("\n\n\n");

  return normalizeText(rows.join("\n"));
}
