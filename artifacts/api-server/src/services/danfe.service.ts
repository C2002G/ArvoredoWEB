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
  documentoTipo?: string;
  documentoDestinatario?: string;
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
  nProt?: string;
  dhRecbto?: string;
  vTotTrib?: number;
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
    // dhEmi vem no formato "2026-05-11T19:26:42-03:00" com timezone já incluído
    // Parse direto sem ajustes manuais de timezone
    const d = new Date(dhEmi);
    return formatarHorarioBrasil(d);
    // Resultado: "11/05/2026 19:26:42"
  } catch {
    return dhEmi;
  }
}

/**
 * Formata data/hora usando o fuso horário Brasil explicitamente.
 * Remove conversões manuais de timezone que causam problemas.
 */
function formatarHorarioBrasil(data: Date | string): string {
  const date = new Date(data);
  
  // Remove conversão manual de timezone - usa o timezone do sistema automaticamente
  // O JavaScript já converte automaticamente datas ISO com timezone para o local
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo"
  });
}

function formatDocumentoFiscal(dest: any) {
  const raw = String(dest?.CNPJ || dest?.CPF || dest?.cnpj || dest?.cpf || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 14) return { tipo: "CNPJ", valor: digits };
  if (digits.length === 11) return { tipo: "CPF", valor: digits };
  return null;
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

  const documentoFiscal = formatDocumentoFiscal(dest);

  // Extrair QR Code de forma limpa e direta
  const infNFeSupl = infNFe?.infNFeSupl || {};
  let extractedQrCode = infNFeSupl?.qrCode || "";
  
  // Se não encontrou no XML parseado, tentar regex como fallback
  if (!extractedQrCode) {
    const qrMatch = xmlAutorizado.match(/<qrCode[^>]*>(?:<!\[CDATA\[)?(https?:\/\/[^<\]]+)(?:\]\]>)?<\/qrCode>/i);
    extractedQrCode = qrMatch ? qrMatch[1].trim() : "";
  }
  
  const chave = chaveAcesso || prot?.chNFe || String(infNFe?.Id || "").replace(/^NFe/, "");
  
  // Priorizar QR Code do parâmetro, depois do XML, depois gerar via chave
  const finalQrCode = qrCodeUrl || extractedQrCode || (chave ? `https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${chave}|3|2` : "");

  return {
    emitente: emit?.xFant || emit?.xNome || "Emitente Nao Identificado",
    destinatario: dest?.xNome || "Consumidor Final",
    documentoTipo: documentoFiscal?.tipo,
    documentoDestinatario: documentoFiscal?.valor,
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
    qrCodeUrl: finalQrCode,
    chaveAcesso: chave || "CHAVE_NAO_ENCONTRADA",
    nProt: prot?.nProt || "",
    dhRecbto: prot?.dhRecbto || "",
    vTotTrib: toNumber(total?.vTotTrib),
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
  if (data.documentoTipo && data.documentoDestinatario) {
    rows.push(`${data.documentoTipo}: ${data.documentoDestinatario}`);
  }
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

  // Seção fiscal unificada - sem duplicações
  rows.push(drawLine());
  rows.push(center("Consulte pela chave de acesso em:"));
  rows.push(center("www.sefaz.rs.gov.br/nfce/consulta"));
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
  vendaDados?: { venda: CupomVenda; itens: CupomItem[]; clienteNome?: string; nProt?: string; dhRecbto?: string; vTotTrib?: number },
) {
  const data = parseXmlAutorizado(xmlAutorizado, qrCodeUrl, chaveAcesso);
  
  // Usar dados reais da venda quando disponíveis, senão fallback para XML
  let text: string;
  if (vendaDados) {
    text = await buildCupomText(
      vendaDados.venda,
      vendaDados.itens,
      vendaDados.clienteNome,
      data.chaveAcesso,
      data.qrCodeUrl,
      {
        nProt: vendaDados.nProt ?? data.nProt,
        dhRecbto: vendaDados.dhRecbto ?? data.dhRecbto,
        vTotTrib: vendaDados.vTotTrib ?? data.vTotTrib,
      },
    );
  } else {
    text = renderDanfeSimplificadoText(data);
  }
  
  const mode = (process.env.DANFE_PRINT_MODE || "auto").toLowerCase();
  const openTimeoutMs = Number(process.env.DANFE_USB_OPEN_TIMEOUT_MS || "5000");
  const totalTimeoutMs = Number(process.env.DANFE_USB_TOTAL_TIMEOUT_MS || "12000");

  const printViaUsb = async () => {
    try {
      // Importação correta do escpos com USB
      const escposMod = await import("escpos");
      const escpos = escposMod.default || escposMod;
      
      // Importar USB separadamente - corrigindo para usar a exportação correta
      const escposUsbMod = await import("escpos-usb");
      const UsbCtor = escposUsbMod.USB || escposUsbMod.default || escposUsbMod;
      
      // Configurar USB no escpos
      escpos.USB = UsbCtor;
      
      console.log("[DANFE] Bibliotecas carregadas, verificando impressora USB...");
      
      // Tentar usar o método USB
      const device = new escpos.USB();
      const printer = new escpos.Printer(device);
      
      await new Promise<void>((resolve, reject) => {
        const totalTimer = setTimeout(() => {
          reject(new Error(`Timeout geral ao imprimir DANFE via USB (${totalTimeoutMs}ms)`));
        }, totalTimeoutMs);
        
        const openTimer = setTimeout(() => {
          clearTimeout(totalTimer);
          reject(new Error(`Timeout ao abrir impressora USB (${openTimeoutMs}ms)`));
        }, openTimeoutMs);
        
        device.open(async (err: Error | null) => {
          clearTimeout(openTimer);
          if (err) {
            clearTimeout(totalTimer);
            console.error("[DANFE] Erro ao abrir impressora USB:", err.message);
            reject(new Error(`Falha ao abrir impressora USB: ${String(err)}`));
            return;
          }
          
          console.log("[DANFE] Impressora USB conectada com sucesso!");
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
                printer.align("ct").qrcode(data.qrCodeUrl, 2, 6, "M");
              } catch (qrError) {
                try {
                  const qrBuffer = await QRCode.toBuffer(data.qrCodeUrl, {
                    type: "png",
                    width: 160,
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
                      if (!img) rej(new Error("Falha ao carregar imagem QR"));
                      res(img);
                    });
                  });
                  printer.align("ct").raster(image);
                } catch (imgError) {
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
      
    } catch (error) {
      console.error("[DANFE] Erro ao inicializar impressora USB:", error);
      throw error;
    }
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

  // Fallback Windows: imprimir tudo em um único comando
  if (data.qrCodeUrl) {
    try {
      const qrBuffer = await QRCode.toBuffer(data.qrCodeUrl, { 
        type: "png", 
        width: 120,
        margin: 1,
        errorCorrectionLevel: "L"
      });
      const qrTempPath = path.join(os.tmpdir(), `arvoredo_qr_${Date.now()}.png`);
      await fs.writeFile(qrTempPath, qrBuffer);
      
      // O texto já contém a seção fiscal do buildCupomText, não duplicar
      
      // Criar script PowerShell que imprime texto E QR Code em um único job
      const psScript = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$textContent = "${text.replace(/"/g, '""').replace(/\r\n/g, '`r`n')}"
$img = [System.Drawing.Image]::FromFile('${qrTempPath.replace(/\\/g, '\\\\')}')

# Configurar papel personalizado para impressora térmica (58mm)
# 48 colunas = aprox. 384px @ 80dpi (densidade típica de impressoras térmicas)
$paperSize = New-Object System.Drawing.Printing.PaperSize("Custom", 384, 3000)
$paperSize.RawKind = 256 # Custom paper size

$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings = New-Object System.Drawing.Printing.PrinterSettings
$pd.PrinterSettings.PrinterName = '${process.env.PRINTER_NAME || "ELGIN i7(USB)"}'
$pd.DefaultPageSettings.PaperSize = $paperSize
$pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(2, 2, 5, 5) # Margens mínimas

$pd.add_PrintPage({
  param($s, $e)
  
  # Configurar fonte para impressora térmica
  $font = New-Object System.Drawing.Font("Courier New", 6, [System.Drawing.FontStyle]::Regular)
  $brush = [System.Drawing.Brushes]::Black
  $x = 2
  $y = 5
  $lineHeight = 10
  $maxWidth = 380 # Largura útil para 48 colunas @ 80dpi
  
  # Desenhar cada linha do texto
  $lines = $textContent -split '\r\n'
  foreach ($line in $lines) {
    if ($y -lt 2800) { # Limite de altura para papel contínuo
      $e.Graphics.DrawString($line, $font, $brush, $x, $y)
      $y += $lineHeight
    }
  }
  
  # Desenhar QR Code centralizado com tamanho adequado para 48 colunas
  $qrSize = 120 # Tamanho ajustado para 48 colunas
  $qrX = ($maxWidth - $qrSize) / 2
  $qrY = $y + 5
  $e.Graphics.DrawImage($img, $qrX, $qrY, $qrSize, $qrSize)
  
  # Indicar que não há mais páginas
  $e.HasMorePages = $false
})

$pd.Print()
$img.Dispose()
Write-Output "Impressão completa concluída"
`;
      
      const psScriptPath = path.join(os.tmpdir(), `complete_print_${Date.now()}.ps1`);
      await fs.writeFile(psScriptPath, psScript);
      
      const { exec } = await import("node:child_process");
      await new Promise<void>((res, rej) => {
        const psCommand = `powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`;
        exec(psCommand, { timeout: 20000 }, (err, stdout, stderr) => {
          if (err) {
            rej(err);
          } else {
            res();
          }
        });
      });
      
      // Limpar arquivos temporários
      await fs.rm(qrTempPath, { force: true }).catch(() => {});
      await fs.rm(psScriptPath, { force: true }).catch(() => {});
      
    } catch (qrPrintErr) {
      // Fallback final: imprimir texto com QR Code como URL
      const W = 48;
      const drawLine = () => "-".repeat(W);
      const center = (str: string) => {
        const textStr = str.trim().slice(0, W);
        const pad = Math.max(0, Math.floor((W - textStr.length) / 2));
        return " ".repeat(pad) + textStr + " ".repeat(W - textStr.length - pad);
      };
      
      text += "\r\n\r\n" + drawLine() + "\r\n";
      text += center("QR Code - ESCANEAR ABAIXO") + "\r\n";
      text += drawLine() + "\r\n";
      
      const qrLines = data.qrCodeUrl.match(/.{1,48}/g) || [data.qrCodeUrl];
      text += qrLines.join("\r\n");
      
      text += "\r\n" + drawLine() + "\r\n";
      text += center("Use o celular para escanear") + "\r\n";
      
      await printTextToWindowsPrinter(text);
    }
  } else {
    // Sem QR Code - imprimir apenas texto
    await printTextToWindowsPrinter(text);
  }
}

export async function reimprimirDanfeSimplificado(xmlAutorizado: string, qrCodeUrl?: string, chaveAcesso?: string) {
  const parsed = parseXmlAutorizado(xmlAutorizado, qrCodeUrl, chaveAcesso);
  await imprimirDanfeSimplificado(parsed.qrCodeUrl, parsed.chaveAcesso, xmlAutorizado);
}
