import escpos from "escpos";
import USB from "escpos-usb";
import { XMLParser } from "fast-xml-parser";

type DanfeData = {
  emitente: string;
  destinatario: string;
  numero: string;
  serie: string;
  dataEmissao: string;
  itens: Array<{ descricao: string; qtd: number; unidade: string; valorUnit: number; total: number }>;
  total: number;
  desconto: number;
  valorPago: number;
  troco: number;
  pagamentos: Array<{ meio: string; valor: number }>;
  qrCodeUrl: string;
  chaveAcesso: string;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function meioPagamento(cod: string): string {
  const map: Record<string, string> = {
    "01": "Dinheiro",
    "03": "Cartao credito",
    "04": "Cartao debito",
    "17": "PIX",
    "99": "Outros",
  };
  return map[cod] || cod;
}

function money(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function parseXmlAutorizado(xmlAutorizado: string, qrCodeUrl?: string, chaveAcesso?: string): DanfeData {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const parsed = parser.parse(xmlAutorizado);
  const nfeProc = parsed?.nfeProc || parsed?.NFe || parsed;
  const infNFe = nfeProc?.NFe?.infNFe || nfeProc?.infNFe;
  const ide = infNFe?.ide || {};
  const emit = infNFe?.emit || {};
  const dest = infNFe?.dest || {};
  const total = infNFe?.total?.ICMSTot || {};
  const pag = infNFe?.pag || {};
  const infNFeSupl = nfeProc?.NFe?.infNFeSupl || infNFe?.infNFeSupl || {};
  const prot = nfeProc?.protNFe?.infProt || {};
  const det = asArray(infNFe?.det);
  const detPag = asArray(pag?.detPag);
  const qrcode = qrCodeUrl || infNFeSupl?.qrCode || "";
  const chave =
    chaveAcesso ||
    prot?.chNFe ||
    String(infNFe?.Id || "").replace(/^NFe/, "");

  return {
    emitente: emit?.xFant || emit?.xNome || "Emitente",
    destinatario: dest?.xNome || "Consumidor final",
    numero: String(ide?.nNF || ""),
    serie: String(ide?.serie || ""),
    dataEmissao: String(ide?.dhEmi || ""),
    itens: det.map((item: any) => ({
      descricao: item?.prod?.xProd || "Item",
      qtd: toNumber(item?.prod?.qCom),
      unidade: item?.prod?.uCom || "UN",
      valorUnit: toNumber(item?.prod?.vUnCom),
      total: toNumber(item?.prod?.vProd),
    })),
    total: toNumber(total?.vNF),
    desconto: toNumber(total?.vDesc),
    valorPago: toNumber(pag?.vTroco ? toNumber(total?.vNF) + toNumber(pag?.vTroco) : total?.vNF),
    troco: toNumber(pag?.vTroco),
    pagamentos: detPag.map((item: any) => ({
      meio: meioPagamento(String(item?.tPag || "")),
      valor: toNumber(item?.vPag),
    })),
    qrCodeUrl: qrcode,
    chaveAcesso: chave,
  };
}

function renderDanfeSimplificado(data: DanfeData): string[] {
  const lines: string[] = [];
  lines.push("DANFE NFC-e");
  lines.push("Documento Auxiliar da Nota Fiscal");
  lines.push("de Consumidor Eletronica");
  lines.push("----------------------------------------");
  lines.push(data.emitente);
  lines.push(`NF: ${data.numero}  Serie: ${data.serie}`);
  lines.push(`Emissao: ${data.dataEmissao}`);
  lines.push(`Dest: ${data.destinatario}`);
  lines.push("----------------------------------------");
  lines.push("Itens");
  for (const item of data.itens) {
    lines.push(item.descricao.slice(0, 38));
    lines.push(`${item.qtd} ${item.unidade} x ${money(item.valorUnit)} = ${money(item.total)}`);
  }
  lines.push("----------------------------------------");
  lines.push(`Total: ${money(data.total)}`);
  if (data.desconto > 0) lines.push(`Desconto: ${money(data.desconto)}`);
  if (data.pagamentos.length) {
    lines.push("Pagamentos:");
    for (const p of data.pagamentos) lines.push(`${p.meio}: ${money(p.valor)}`);
  }
  if (data.troco > 0) lines.push(`Troco: ${money(data.troco)}`);
  lines.push("----------------------------------------");
  lines.push("Consulte pela chave:");
  lines.push("https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx");
  lines.push(data.chaveAcesso.replace(/(\d{4})/g, "$1 ").trim());
  lines.push("");
  lines.push("QR CODE NFC-e:");
  return lines;
}

function getUsbDevice() {
  const vid = Number(process.env.PRINTER_VID || "0x0483");
  const pid = Number(process.env.PRINTER_PID || "0x5743");
  return new USB(vid, pid);
}

export async function imprimirDanfeSimplificado(
  qrCodeUrl: string,
  chaveAcesso: string,
  xmlAutorizado: string,
) {
  const data = parseXmlAutorizado(xmlAutorizado, qrCodeUrl, chaveAcesso);
  const lines = renderDanfeSimplificado(data);

  await new Promise<void>((resolve, reject) => {
    const device = getUsbDevice();
    const printer = new escpos.Printer(device);
    device.open((err: Error | null) => {
      if (err) {
        reject(new Error(`Falha ao abrir impressora USB: ${String(err)}`));
        return;
      }
      try {
        printer.align("ct").style("b");
        for (const line of lines) printer.text(line);
        if (data.qrCodeUrl) printer.qrcode(data.qrCodeUrl, 2, 6, "l");
        printer.text("").cut().close();
        resolve();
      } catch (printErr) {
        reject(printErr);
      }
    });
  });
}

export async function reimprimirDanfeSimplificado(xmlAutorizado: string, qrCodeUrl?: string, chaveAcesso?: string) {
  const parsed = parseXmlAutorizado(xmlAutorizado, qrCodeUrl, chaveAcesso);
  await imprimirDanfeSimplificado(parsed.qrCodeUrl, parsed.chaveAcesso, xmlAutorizado);
}
