import type { Venda, ItemVenda } from "@workspace/db/schema";

/**
 * Tipos simplificados para a função de impressão.
 */
export type CupomItem = Pick<ItemVenda, 'produto_id' | 'nome_snap' | 'quantidade' | 'preco_unit' | 'subtotal' | 'unidades'>;
export type CupomVenda = Pick<Venda, 'id' | 'criado_em' | 'total' | 'desconto' | 'observacao'>;
export type SangriaPayload = { data_inicio: string; data_fim: string; sessao_id?: number | null; };
export type SangriaVenda = Pick<Venda, 'total' | 'pagamento'>;
export type SangriaItem = { valor: number; };


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
const formatMoneyTight = (value: number) => value.toFixed(2).replace(".", ",");
const drawLine = (width = PRINTER_LAYOUT.colunas) => "-".repeat(width);

/**
 * VERSÃO CORRIGIDA: Formata a data/hora usando o fuso horário padrão do servidor,
 * que já está definido como "America/Sao_Paulo" em index.ts. Isso evita dupla correção.
 */
function formatarHorarioBrasil(data: Date | string): string {
  const date = new Date(data);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    // A opção timeZone foi REMOVIDA para usar a configuração do ambiente
  });
}

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

function padLeft(value: string, size: number) {
  const v = value.slice(0, size);
  if (v.length >= size) return v;
  return `${" ".repeat(size - v.length)}${v}`;
}

function centerText(value: string, width = PRINTER_LAYOUT.colunas) {
  const clean = value.replace(/\r?\n/g, " ").trim().slice(0, width);
  const left = Math.max(0, Math.floor((width - clean.length) / 2));
  return padRight(`${" ".repeat(left)}${clean}`, width);
}

function wrapText(text: string, w: number): string[] {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length <= w) return [t];
    const out: string[] = [];
    let rest = t;
    while (rest.length > 0) {
        if (rest.length <= w) { out.push(rest); break; }
        let cut = rest.lastIndexOf(" ", w);
        if (cut <= 0) cut = w;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    return out;
}

function codigo6(item: CupomItem) {
  if (item.produto_id != null) {
    return String(item.produto_id).padStart(6, "0").slice(-6);
  }
  const n = String(item.nome_snap).replace(/\D/g, "");
  return (n + "000000").slice(0, 6);
}

function qtdUndItem(item: CupomItem) {
  const u = item.unidades != null && item.unidades > 0;
  if (u) return { qNum: item.unidades, und: "UN" as const };
  const isInteiro = Math.abs(item.quantidade - Math.round(item.quantidade)) < 0.0001;
  if (isInteiro) return { qNum: item.quantidade, und: "UN" as const };
  return { qNum: item.quantidade, und: "KG" as const };
}

function linhaItem48(item: CupomItem) {
  const cod = codigo6(item);
  const desc = String(item.nome_snap).replace(/\s+/g, " ").trim();
  const { qNum, und } = qtdUndItem(item);
  const q5 = padLeft(formatMoneyTight(Number(qNum)), 5);
  const vu = formatMoneyTight(item.preco_unit);
  const vt = formatMoneyTight(item.subtotal);
  return (
    padRight(cod, 6) +
    padRight(desc, 20) +
    q5 + und +
    padLeft(vu, 6) +
    padLeft("0,00", 4) +
    padLeft(vt, 5)
  );
}

export async function buildCupomText(
  venda: CupomVenda,
  itens: CupomItem[],
  clienteNome?: string,
  chaveAcesso?: string,
) {
  const W = PRINTER_LAYOUT.colunas;
  const rows: string[] = [];

  rows.push(centerText(PRINTER_LAYOUT.empresa.nome, W));
  rows.push(`CNPJ: ${PRINTER_LAYOUT.empresa.cnpj}  IE: ${PRINTER_LAYOUT.empresa.ie}`.slice(0, W));
  for (const ln of wrapText(PRINTER_LAYOUT.empresa.endereco, W)) rows.push(ln);
  rows.push(`Fone: ${PRINTER_LAYOUT.empresa.telefone}`.slice(0, W));
  rows.push(centerText("Documento Auxiliar da Nota Fiscal de", W));
  rows.push(centerText("Consumidor Eletronica", W));
  rows.push(drawLine(W));

  rows.push("Cod.  Descricao          Qtd Und VlrU Dc VlTot ".slice(0, W));
  rows.push(drawLine(W));

  for (const item of itens) {
    rows.push(linhaItem48(item).slice(0, W));
    const u = item.unidades != null && item.unidades > 0 ? item.unidades : 0;
    const isInteiroQtd = Math.abs(item.quantidade - Math.round(item.quantidade)) < 0.0001;
    if (u > 0 || !isInteiroQtd) {
      rows.push(
        `  * Peso: ${item.quantidade.toFixed(3).replace(".", ",")} kg  x  ${formatMoney(item.preco_unit)}/kg`.slice(0, W),
      );
    }
  }

  rows.push(drawLine(W));
  rows.push(`Qtd. total de itens: ${itens.length}`.slice(0, W));
  rows.push(`Valor total R$ ${venda.total.toFixed(2).replace(".", ",")}`.slice(0, W));
  if (venda.desconto && venda.desconto > 0) {
    rows.push(`Desconto R$ ${venda.desconto.toFixed(2).replace(".", ",")}`.slice(0, W));
  }
  rows.push(drawLine(W));
  if (clienteNome) rows.push(`Consumidor: ${clienteNome}`.slice(0, W));
  if (venda.observacao) {
     for (const ln of wrapText(`Obs: ${venda.observacao}`, W)) rows.push(ln);
  }
  rows.push(`NFC-e ref. venda #${venda.id}  ${formatarHorarioBrasil(venda.criado_em)}`.slice(0, W));
  
  if (chaveAcesso) {
    rows.push(drawLine(W));
    rows.push(centerText("Consulte pela Chave de Acesso em:", W));
    rows.push(centerText("www.sefaz.rs.gov.br/nfce/consulta", W));
    rows.push(centerText(chaveAcesso.replace(/(\d{4})/g, "$1 ").trim(), W));
    rows.push(drawLine(W));
    rows.push(centerText("Consulte sua NFC-e pelo QR Code", W));
  } else {
    rows.push(drawLine(W));
    rows.push(centerText("CUPOM SEM VALOR FISCAL", W));
  }
  
  rows.push(drawLine(W));
  rows.push(centerText("Obrigado pela preferencia!", W));
  rows.push("");

  return normalizeText(rows.join("\n"));
}

export function buildSangriaText(
  payload: SangriaPayload,
  vendas: SangriaVenda[],
  sangrias: SangriaItem[],
) {
  const W = PRINTER_LAYOUT.colunas;
  const rows: string[] = [];
  rows.push(centerText(PRINTER_LAYOUT.empresa.nome, W));
  rows.push(centerText("RELATORIO DE SANGRIA", W));
  rows.push(drawLine(W));
  rows.push(`PERIODO: ${payload.data_inicio} ate ${payload.data_fim}`.slice(0, W));
  if (payload.sessao_id) rows.push(`SESSAO: ${payload.sessao_id}`.slice(0, W));
  rows.push(drawLine(W));

  const totalVendas = vendas.reduce((sum, item) => sum + item.total, 0);
  const totalDinheiro = vendas.filter((v) => v.pagamento === "dinheiro").reduce((s, v) => s + v.total, 0);
  const totalPix = vendas.filter((v) => v.pagamento === "pix").reduce((s, v) => s + v.total, 0);
  const totalCartao = vendas.filter((v) => v.pagamento === "cartao").reduce((s, v) => s + v.total, 0);
  const totalFiado = vendas.filter((v) => v.pagamento === "fiado").reduce((s, v) => s + v.total, 0);
  const totalSangrias = sangrias.reduce((sum, item) => sum + item.valor, 0);

  rows.push(`Vendas: ${vendas.length}`.slice(0, W));
  rows.push(`Total vendas: ${formatMoney(totalVendas)}`.slice(0, W));
  rows.push(`Dinheiro: ${formatMoney(totalDinheiro)}`.slice(0, W));
  rows.push(`PIX: ${formatMoney(totalPix)}`.slice(0, W));
  rows.push(`Cartao: ${formatMoney(totalCartao)}`.slice(0, W));
  rows.push(`Fiado: ${formatMoney(totalFiado)}`.slice(0, W));
  rows.push(drawLine(W));
  rows.push(`Sangrias: ${sangrias.length}`.slice(0, W));
  rows.push(`Total sangria: ${formatMoney(totalSangrias)}`.slice(0, W));
  rows.push(drawLine(W));
  rows.push("Fim do relatorio");
  rows.push("");

  return normalizeText(rows.join("\n"));
}