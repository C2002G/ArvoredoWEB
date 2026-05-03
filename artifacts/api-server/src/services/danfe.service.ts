import { XMLParser } from "fast-xml-parser";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { printTextToWindowsPrinter } from "../lib/printer";

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
  const map: Record<string, string> = { "01": "Dinheiro", "03": "Cartao Credito", "04": "Cartao Debito", "05": "Credito Loja", "17": "PIX", "99": "Outros" };
  return map[cod] || cod;
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
  const prot = nfeProc?.protNFe?.infProt || {};

  const det = asArray(infNFe?.det);
  const detPag = asArray(pag?.detPag);

  const matchQr = xmlAutorizado.match(/<qrCode[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/qrCode>/i);
  const qrcode = qrCodeUrl || (matchQr ? matchQr[1].trim() : "");
  const chave = chaveAcesso || prot?.chNFe || String(infNFe?.Id || "").replace(/^NFe/, "");

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

function renderDanfeSimplificadoText(data: DanfeData): string {
  const W = 48; // Largura do cupom em colunas
  const rows: string[] = [];
  const drawLine = () => "-".repeat(W);
  const center = (str: string) => {
    const text = str.trim().slice(0, W);
    const pad = Math.max(0, Math.floor((W - text.length) / 2));
    return " ".repeat(pad) + text + " ".repeat(W - text.length - pad);
  };

  rows.push(center(data.emitente));
  rows.push(center("DANFE NFC-e"));
  rows.push(center("Documento Auxiliar da Nota Fiscal"));
  rows.push(drawLine());
  rows.push(`NF: ${data.numero}  Serie: ${data.serie}`);
  rows.push(`Emissao: ${data.dataEmissao}`);
  rows.push(`Destinatario: ${data.destinatario}`);
  rows.push(drawLine());
  rows.push("Qtd Und x Vlr.Unit = Total");

  for (const item of data.itens) {
    rows.push(item.descricao.slice(0, W));
    rows.push(`  ${item.qtd} ${item.unidade} x R$ ${item.valorUnit.toFixed(2)} = R$ ${item.total.toFixed(2)}`);
  }

  rows.push(drawLine());
  rows.push(`Valor Total: R$ ${data.total.toFixed(2)}`);
  if (data.desconto > 0) rows.push(`Desconto: R$ ${data.desconto.toFixed(2)}`);
  rows.push(`Valor Pago:  R$ ${data.valorPago.toFixed(2)}`);

  if (data.pagamentos.length > 0) {
    rows.push("Pagamentos:");
    for (const p of data.pagamentos) rows.push(`  ${p.meio}: R$ ${p.valor.toFixed(2)}`);
  }
  if (data.troco > 0) rows.push(`Troco: R$ ${data.troco.toFixed(2)}`);

  rows.push(drawLine());
  rows.push(center("Consulte pela chave de acesso em:"));
  rows.push(center("www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx"));
  rows.push(center(data.chaveAcesso.replace(/(\d{4})/g, "$1 ").trim()));

  if (data.qrCodeUrl) {
    rows.push(drawLine());
    rows.push(center("Consulta via QR Code (Acesse o Link):"));
    rows.push(data.qrCodeUrl.slice(0, W));
    if (data.qrCodeUrl.length > W) rows.push(data.qrCodeUrl.slice(W, W * 2));
    if (data.qrCodeUrl.length > W * 2) rows.push(data.qrCodeUrl.slice(W * 2, W * 3));
  }

  rows.push(drawLine());
  rows.push(center("Obrigado pela preferencia!"));
  rows.push("\r\n\r\n\r\n\r\n"); // Folga para corte

  return rows.map((r) => r.trimEnd()).join("\r\n");
}

export async function imprimirDanfeSimplificado(
  qrCodeUrl: string,
  chaveAcesso: string,
  xmlAutorizado: string,
) {
  const data = parseXmlAutorizado(xmlAutorizado, qrCodeUrl, chaveAcesso);
  const text = renderDanfeSimplificadoText(data);
  const mode = (process.env.DANFE_PRINT_MODE || "auto").toLowerCase();
  const openTimeoutMs = Number(process.env.DANFE_USB_OPEN_TIMEOUT_MS || "5000");
  const totalTimeoutMs = Number(process.env.DANFE_USB_TOTAL_TIMEOUT_MS || "12000");

  const printViaUsb = async () => {
    const escposMod: any = await import("escpos");
    const escpos = escposMod.default || escposMod;
    const escposUsbMod: any = await import("escpos-usb");
    const UsbCtor = escposUsbMod.default || escposUsbMod;
    escpos.USB = UsbCtor;

    await new Promise<void>((resolve, reject) => {
      const totalTimer = setTimeout(() => {
        reject(new Error(`Timeout geral ao imprimir DANFE via USB (${totalTimeoutMs}ms)`));
      }, totalTimeoutMs);
      let device: any;
      try {
        device = new escpos.USB();
      } catch (err) {
        clearTimeout(totalTimer);
        reject(err);
        return;
      }

      const printer = new escpos.Printer(device);
      const openTimer = setTimeout(() => {
        clearTimeout(totalTimer);
        reject(new Error(`Timeout ao abrir impressora USB (${openTimeoutMs}ms)`));
      }, openTimeoutMs);
      device.open(async (err: Error | null) => {
        clearTimeout(openTimer);
        if (err) {
          clearTimeout(totalTimer);
          reject(new Error(`Falha ao abrir impressora USB: ${String(err)}`));
          return;
        }
        let qrTempPath: string | null = null;
        try {
          const lines = text.split(/\r?\n/);
          // Modo mais escuro para texto (double-strike + emphasized).
          printer.raw(Buffer.from([0x1b, 0x47, 0x01])); // ESC G 1
          printer.raw(Buffer.from([0x1b, 0x45, 0x01])); // ESC E 1
          printer.align("ct").font("a").size(1, 1).text(" ");
          for (const line of lines) {
            printer.text(line);
          }
          printer.raw(Buffer.from([0x1b, 0x45, 0x00])); // ESC E 0
          printer.raw(Buffer.from([0x1b, 0x47, 0x00])); // ESC G 0

          if (data.qrCodeUrl) {
            try {
              const qrBuffer = await QRCode.toBuffer(data.qrCodeUrl, {
                type: "png",
                width: 200,
                margin: 1,
              });
              qrTempPath = path.join(
                os.tmpdir(),
                `arvoredo_qr_${Date.now()}_${Math.random().toString(36).slice(2)}.png`,
              );
              await fs.writeFile(qrTempPath, qrBuffer);
              const image = await new Promise<any>((res, rej) => {
                escpos.Image.load(qrTempPath, (img: any) => {
                  if (!img) {
                    rej(new Error("Falha ao carregar imagem QR"));
                    return;
                  }
                  res(img);
                });
              });
              printer.align("ct").raster(image);
            } catch {
              printer.align("ct").qrcode(data.qrCodeUrl, 2, 6, "l");
            }
          }

          printer.text(" ").cut().close(() => {
            clearTimeout(totalTimer);
            resolve();
          });
        } catch (printErr) {
          clearTimeout(totalTimer);
          reject(printErr);
        } finally {
          if (qrTempPath) {
            await fs.rm(qrTempPath, { force: true }).catch(() => undefined);
          }
        }
      });
    });
  };

  if (mode === "windows") {
    await printTextToWindowsPrinter(text);
    return;
  }

  if (mode === "usb") {
    await printViaUsb();
    return;
  }

  try {
    await printViaUsb();
  } catch {
    await printTextToWindowsPrinter(text);
  }
}

export async function reimprimirDanfeSimplificado(xmlAutorizado: string, qrCodeUrl?: string, chaveAcesso?: string) {
  const parsed = parseXmlAutorizado(xmlAutorizado, qrCodeUrl, chaveAcesso);
  await imprimirDanfeSimplificado(parsed.qrCodeUrl, parsed.chaveAcesso, xmlAutorizado);
}
