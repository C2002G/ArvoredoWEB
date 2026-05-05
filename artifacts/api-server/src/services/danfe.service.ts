import { XMLParser } from "fast-xml-parser";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { printTextToWindowsPrinter } from "../lib/printer";
import { buildCupomText, type CupomVenda, type CupomItem } from "../lib/print-layout";

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

function formatarDataEmissao(dhEmi: string | undefined): string {
  if (!dhEmi) return formatarHorarioBrasil(new Date());
  try {
    // dhEmi vem no formato "2026-05-01T14:32:00-03:00"
    const d = new Date(dhEmi);
    return formatarHorarioBrasil(d);
    // Resultado: "01/05/2026 14:32:00"
  } catch {
    return dhEmi;
  }
}

/**
 * Formata data/hora para timezone Brasil (UTC-3) de forma robusta.
 * Evita problemas com timezone America/Sao_Paulo que pode ter DST desatualizado.
 */
function formatarHorarioBrasil(data: Date | string): string {
  const date = new Date(data);
  // Converte para UTC-3 (Brasil) sem depender de timezone do sistema
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000);
  const brasilTime = new Date(utcTime + (3 * 3600000)); // UTC-3
  
  return brasilTime.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
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

  // Debug: logar estrutura do XML para diagnóstico
  console.log("[DANFE] Estrutura XML:", JSON.stringify({
    emitente: emit?.xFant || emit?.xNome,
    destinatario: dest?.xNome,
    numero: ide?.nNF,
    serie: ide?.serie,
    totalItens: det.length,
    total: total?.vNF,
    qrCodeLength: qrcode.length
  }, null, 2));

  return {
    emitente: emit?.xFant || emit?.xNome || "Emitente Nao Identificado",
    destinatario: dest?.xNome || "Consumidor Final",
    numero: String(ide?.nNF || "000"),
    serie: String(ide?.serie || "1"),
    dataEmissao: formatarDataEmissao(ide?.dhEmi),
    itens: det.map((item: any) => ({
      descricao: item?.prod?.xProd || "Produto Nao Identificado",
      qtd: toNumber(item?.prod?.qCom) || 1,
      unidade: item?.prod?.uCom || "UN",
      valorUnit: toNumber(item?.prod?.vUnCom) || 0,
      total: toNumber(item?.prod?.vProd) || 0,
    })),
    total: toNumber(total?.vNF) || 0,
    desconto: toNumber(total?.vDesc) || 0,
    valorPago: toNumber(pag?.vTroco ? toNumber(total?.vNF) + toNumber(pag?.vTroco) : total?.vNF) || 0,
    troco: toNumber(pag?.vTroco) || 0,
    pagamentos: detPag.map((item: any) => ({
      meio: meioPagamento(String(item?.tPag || "01")),
      valor: toNumber(item?.vPag) || 0,
    })),
    qrCodeUrl: qrcode,
    chaveAcesso: chave || "CHAVE_NAO_ENCONTRADA",
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
    rows.push(center("Consulta via QR Code:"));
    rows.push(center("Aponte a câmera para o QR Code abaixo"));
    // QR Code será impresso como imagem via ESC/POS, não como texto
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
  vendaDados?: { venda: CupomVenda; itens: CupomItem[]; clienteNome?: string },
) {
  const data = parseXmlAutorizado(xmlAutorizado, qrCodeUrl, chaveAcesso);
  // Usar dados reais da venda quando disponíveis, senão fallback para XML
  let text: string;
  if (vendaDados) {
    // Usar buildCupomText com dados reais do banco
    text = await buildCupomText(vendaDados.venda, vendaDados.itens, vendaDados.clienteNome, data.qrCodeUrl || undefined,);
    
    // Adicionar bloco fiscal no final (chave de acesso + QR Code)
    const W = 48;
    const drawLine = () => "-".repeat(W);
    const center = (str: string) => {
      const textStr = str.trim().slice(0, W);
      const pad = Math.max(0, Math.floor((W - textStr.length) / 2));
      return " ".repeat(pad) + textStr + " ".repeat(W - textStr.length - pad);
    };
    
    text += "\r\n\r\n" + drawLine() + "\r\n";
    text += center("DANFE NFC-e - DOCUMENTO AUXILIAR") + "\r\n";
    text += center("Consulta pela chave de acesso em:") + "\r\n";
    text += center("www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx") + "\r\n";
    text += center(data.chaveAcesso.replace(/(\d{4})/g, "$1 ").trim()) + "\r\n";
    
    if (data.qrCodeUrl) {
      text += drawLine() + "\r\n";
      text += center("Consulta via QR Code:") + "\r\n";
      text += center("Aponte a câmera para o QR Code abaixo") + "\r\n";
      // QR Code será impresso como imagem via ESC/POS, não como texto
    }
    
    text += drawLine() + "\r\n";
    text += center("Obrigado pela preferencia!") + "\r\n";
    text += "\r\n\r\n\r\n\r\n"; // Folga para corte
  } else {
    // Fallback: usar renderDanfeSimplificadoText baseado apenas no XML
    text = renderDanfeSimplificadoText(data);
  }
  
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
              // Tenta QR Code via ESC/POS command primeiro (mais confiável)
              printer.align("ct").qrcode(data.qrCodeUrl, 2, 6, "M");
            } catch (qrError) {
              console.log("[DANFE] ESC/POS QR Code falhou, tentando como imagem:", qrError);
              try {
                // Fallback: gerar imagem PNG e imprimir como raster
                const qrBuffer = await QRCode.toBuffer(data.qrCodeUrl, {
                  type: "png",
                  width: 160, // Reduzido para melhor compatibilidade
                  margin: 2,
                  errorCorrectionLevel: "M",
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
              } catch (imgError) {
                console.log("[DANFE] Imagem QR Code falhou, imprimindo URL:", imgError);
                // Fallback final: imprimir URL como texto
                printer.align("ct").text("QR Code: " + data.qrCodeUrl);
              }
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

  // Priorizar USB para QR Code como imagem
  if (mode === "usb" || mode === "auto") {
    try {
      await printViaUsb();
      return;
    } catch (usbError) {
      console.log("[DANFE] Falha na impressão USB, usando fallback Windows:", usbError);
    }
  }

  // Fallback Windows: primeiro imprimir texto, depois QR Code como imagem
  await printTextToWindowsPrinter(text);
  
  if (data.qrCodeUrl) {
    try {
      console.log("[DANFE] Gerando QR Code para impressão Windows...");
      const qrBuffer = await QRCode.toBuffer(data.qrCodeUrl, { 
        type: "png", 
        width: 160, // Reduzido para melhor compatibilidade
        margin: 2,
        errorCorrectionLevel: "M"
      });
      const qrTempPath = path.join(os.tmpdir(), `arvoredo_qr_${Date.now()}.png`);
      await fs.writeFile(qrTempPath, qrBuffer);
      
      // PowerShell melhorado: imprimir com tratamento de erro e especificar impressora padrão
      const psScript = `
try {
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  
  $img = [System.Drawing.Image]::FromFile('${qrTempPath.replace(/\\/g, "\\\\")}')
  $pd = New-Object System.Drawing.Printing.PrintDocument
  
  # Usar impressora padrão do sistema
  $pd.PrinterSettings = New-Object System.Drawing.Printing.PrinterSettings
  $pd.DefaultPageSettings.Landscape = $false
  
  $pd.add_PrintPage({
    param($s, $e)
    # Centralizar QR Code na página
    $pageWidth = $s.MarginBounds.Width
    $pageHeight = $s.MarginBounds.Height
    $qrSize = 160
    $x = ($pageWidth - $qrSize) / 2
    $y = 20
    $e.Graphics.DrawImage($img, $x, $y, $qrSize, $qrSize)
  })
  
  $pd.Print()
  $img.Dispose()
  Write-Output "QR Code impresso com sucesso"
} catch {
  Write-Error "Erro ao imprimir QR Code: $_"
  exit 1
}
`.trim();

      const { exec } = await import("node:child_process");
      await new Promise<void>((res, rej) => {
        const psCommand = `powershell -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
        console.log("[DANFE] Executando PowerShell para QR Code...");
        exec(psCommand, { timeout: 30000 }, (err, stdout, stderr) => {
          if (err) {
            console.error("[DANFE] PowerShell error:", stderr);
            rej(err);
          } else {
            console.log("[DANFE] PowerShell output:", stdout);
            res();
          }
        });
      });
      
      // Limpar arquivo temporário
      await fs.rm(qrTempPath, { force: true }).catch(() => {});
      console.log("[DANFE] QR Code impresso via PowerShell com sucesso");
      
    } catch (qrPrintErr) {
      console.error("[DANFE] Falha ao imprimir QR Code via PowerShell:", qrPrintErr);
      // fallback final: imprimir URL como texto formatado
      const W = 48;
      const drawLine = () => "-".repeat(W);
      const center = (str: string) => {
        const textStr = str.trim().slice(0, W);
        const pad = Math.max(0, Math.floor((W - textStr.length) / 2));
        return " ".repeat(pad) + textStr + " ".repeat(W - textStr.length - pad);
      };
      let fallbackText = "\r\n\r\n" + drawLine() + "\r\n" + center("QR Code (URL):") + "\r\n";
      const qrLines = data.qrCodeUrl.match(/.{1,48}/g) || [data.qrCodeUrl];
      fallbackText += qrLines.join("\r\n");
      fallbackText += "\r\n" + center("Escaneie o código acima") + "\r\n";
      await printTextToWindowsPrinter(fallbackText);
    }
  }
}

export async function reimprimirDanfeSimplificado(xmlAutorizado: string, qrCodeUrl?: string, chaveAcesso?: string) {
  const parsed = parseXmlAutorizado(xmlAutorizado, qrCodeUrl, chaveAcesso);
  await imprimirDanfeSimplificado(parsed.qrCodeUrl, parsed.chaveAcesso, xmlAutorizado);
}
