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

  // Debug completo do XML para encontrar QR Code
  console.log("[DANFE] XML completo (primeiros 500 chars):", xmlAutorizado.substring(0, 500));
  console.log("[DANFE] Procurando por QR Code no XML...");
  
  // Múltiplas tentativas de regex para encontrar QR Code
  const regexPatterns = [
    /<qrCode[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/qrCode>/i,
    /<infNFeSupl>[\s\S]*<qrCode[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/qrCode>/i,
    /<qrCode>([^<]*)<\/qrCode>/i,
    /QR-Code[^>]*>([^<]*)<\/QR-Code>/i
  ];
  
  let matchQr = null;
  for (let i = 0; i < regexPatterns.length; i++) {
    matchQr = xmlAutorizado.match(regexPatterns[i]);
    if (matchQr) {
      console.log(`[DANFE] QR Code encontrado com padrão ${i + 1}`);
      break;
    }
  }
  
  const chave = chaveAcesso || prot?.chNFe || String(infNFe?.Id || "").replace(/^NFe/, "");
  
  const qrcode = qrCodeUrl || (matchQr ? matchQr[1].trim() : "");
  
  // Se não encontrou QR Code no XML, gerar um usando a chave de acesso
  const finalQrCode = qrcode || (chave ? `https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${chave}|2|1|1` : "");
  
  if (!qrcode && finalQrCode) {
    console.log("[DANFE] QR Code não encontrado no XML, gerando via chave de acesso:", finalQrCode.substring(0, 100) + "...");
  }

  // Debug: logar estrutura do XML para diagnóstico
  console.log("[DANFE] Analisando XML autorizado:", {
    temQRCode: !!matchQr,
    qrCodeLength: qrcode.length,
    qrCodeUrl: qrcode.substring(0, 100) + (qrcode.length > 100 ? "..." : ""),
    chaveAcesso: chave?.substring(0, 20) + "...",
    emitente: emit?.xFant || emit?.xNome,
    totalItens: det.length,
    total: total?.vNF
  });

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
    qrCodeUrl: finalQrCode,
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
    try {
      // Importação correta do escpos com USB
      const escposMod = await import("escpos");
      const escpos = escposMod.default || escposMod;
      
      // Importar USB separadamente
      const escposUsbMod = await import("escpos-usb");
      const UsbCtor = escposUsbMod.default || escposUsbMod;
      
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
              console.log("[DANFE] Iniciando impressão do QR Code:", data.qrCodeUrl);
              try {
                // Tenta QR Code via ESC/POS command primeiro (mais confiável)
                console.log("[DANFE] Tentando QR Code via ESC/POS command...");
                printer.align("ct").qrcode(data.qrCodeUrl, 2, 6, "M");
                console.log("[DANFE] QR Code ESC/POS command enviado com sucesso");
              } catch (qrError) {
                console.error("[DANFE] ESC/POS QR Code falhou, tentando como imagem:", qrError);
                try {
                  // Fallback: gerar imagem PNG e imprimir como raster
                  console.log("[DANFE] Gerando QR Code como imagem PNG...");
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
                  console.log("[DANFE] QR Code PNG salvo em:", qrTempPath);
                  
                  const image = await new Promise<any>((res, rej) => {
                    escpos.Image.load(qrTempPath, (img: any) => {
                      if (!img) {
                        rej(new Error("Falha ao carregar imagem QR"));
                        return;
                      }
                      console.log("[DANFE] Imagem QR Code carregada com sucesso");
                      res(img);
                    });
                  });
                  printer.align("ct").raster(image);
                  console.log("[DANFE] QR Code impresso como raster com sucesso");
                } catch (imgError) {
                  console.error("[DANFE] Imagem QR Code falhou, imprimindo URL:", imgError);
                  // Fallback final: imprimir URL como texto
                  printer.align("ct").text("QR Code: " + data.qrCodeUrl);
                  console.log("[DANFE] QR Code impresso como URL (fallback)");
                }
              }
            } else {
              console.warn("[DANFE] AVISO: QR Code URL não encontrada no XML");
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
    console.log("[DANFE] Iniciando impressão completa em uma folha...");
    try {
      console.log("[DANFE] QR Code URL:", data.qrCodeUrl);
      
      // Gerar QR Code pequeno e legível (120px)
      const qrBuffer = await QRCode.toBuffer(data.qrCodeUrl, { 
        type: "png", 
        width: 120, // Tamanho ideal para escaneamento
        margin: 2,
        errorCorrectionLevel: "L" // Menos correção, mais legível
      });
      const qrTempPath = path.join(os.tmpdir(), `arvoredo_qr_${Date.now()}.png`);
      await fs.writeFile(qrTempPath, qrBuffer);
      console.log("[DANFE] QR Code PNG salvo em:", qrTempPath);
      
      // Adicionar QR Code ao texto principal na posição correta
      const W = 48;
      const drawLine = () => "-".repeat(W);
      const center = (str: string) => {
        const textStr = str.trim().slice(0, W);
        const pad = Math.max(0, Math.floor((W - textStr.length) / 2));
        return " ".repeat(pad) + textStr + " ".repeat(W - textStr.length - pad);
      };
      
      // Adicionar seção fiscal com QR Code no lugar correto
      text += "\r\n\r\n" + drawLine() + "\r\n";
      text += center("Consulte pela chave de acesso em:") + "\r\n";
      text += center("www.sefaz.rs.gov.br/nfce/consulta") + "\r\n";
      text += center(data.chaveAcesso.replace(/(\d{4})/g, "$1 ").trim()) + "\r\n";
      text += drawLine() + "\r\n";
      text += center("Consulte sua NFC-e pelo QR Code") + "\r\n";
      text += drawLine() + "\r\n";
      text += "\r\n"; // Espaço para QR Code
      text += "\r\n"; // Mais espaço
      text += "\r\n"; // Mais espaço
      text += "\r\n"; // Espaço para QR Code
      text += "\r\n"; // Mais espaço
      text += drawLine() + "\r\n";
      text += center("Obrigado pela preferência!") + "\r\n";
      text += "\r\n\r\n\r\n"; // Folga para corte
      
      // Criar script PowerShell que imprime texto E QR Code juntos
      const psScript = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

# Primeiro imprimir o texto
$textContent = "${text.replace(/"/g, '""').replace(/\r\n/g, '`r`n')}"
$textContent | Out-Printer -Name '${process.env.PRINTER_NAME || "ELGIN i7(USB)"}'

# Agora imprimir o QR Code pequeno
Start-Sleep -Milliseconds 500

$img = [System.Drawing.Image]::FromFile('${qrTempPath.replace(/\\/g, '\\\\')}')
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings = New-Object System.Drawing.Printing.PrinterSettings
$pd.PrinterSettings.PrinterName = '${process.env.PRINTER_NAME || "ELGIN i7(USB)"}'

$pd.add_PrintPage({
  param($s, $e)
  $pageWidth = $s.MarginBounds.Width
  $pageHeight = $s.MarginBounds.Height
  $qrSize = 120
  $x = ($pageWidth - $qrSize) / 2
  $y = ($pageHeight - $qrSize) / 2
  $e.Graphics.DrawImage($img, $x, $y, $qrSize, $qrSize)
})

$pd.Print()
$img.Dispose()
Write-Output "Impressão completa concluída"
`;
      
      const psScriptPath = path.join(os.tmpdir(), `complete_print_${Date.now()}.ps1`);
      await fs.writeFile(psScriptPath, psScript);
      console.log("[DANFE] Script completo salvo em:", psScriptPath);
      
      const { exec } = await import("node:child_process");
      await new Promise<void>((res, rej) => {
        const psCommand = `powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`;
        console.log("[DANFE] Executando impressão completa...");
        exec(psCommand, { timeout: 20000 }, (err, stdout, stderr) => {
          if (err) {
            console.error("[DANFE] Impressão completa falhou:", stderr);
            rej(err);
          } else {
            console.log("[DANFE] Impressão completa output:", stdout);
            res();
          }
        });
      });
      
      // Limpar arquivos temporários
      await fs.rm(qrTempPath, { force: true }).catch(() => {});
      await fs.rm(psScriptPath, { force: true }).catch(() => {});
      console.log("[DANFE] ✅ Impressão completa em uma folha!");
      
    } catch (qrPrintErr) {
      console.error("[DANFE] ❌ Falha na impressão completa:", qrPrintErr);
      
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
      console.log("[DANFE] QR Code impresso como URL (fallback final)");
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
