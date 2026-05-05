import { Router } from "express";
import { db } from "@workspace/db";
import { ImprimirCupomBody, ImprimirSangriaBody } from "@workspace/api-zod";
import {
  vendasTable,
  itensVendaTable,
  clientesTable,
  sangriasTable,
  nfceLogsTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { printTextToWindowsPrinter, resolvePrinterName } from "../lib/printer";
import { buildCupomText, buildSangriaText } from "../lib/print-layout";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Tenta imprimir via USB/ESCpos (para suportar QR code).
 * Se falhar, usa o fallback para impressão de texto via PowerShell.
 */
async function printCupomWithQrCode(text: string, qrCodeUrl?: string) {
  try {
    const escpos = (await import("escpos")).default;
    const UsbDevice = (await import("escpos-usb")).default;
    escpos.USB = UsbDevice;
    const device = new escpos.USB();
    const printer = new escpos.Printer(device);

    await new Promise<void>((resolve, reject) => {
      device.open((err: Error | null) => {
        if (err) {
          return reject(new Error(`Falha ao abrir impressora USB: ${err.message}`));
        }
        
        try {
          printer.font("a").align("ct").style("normal").size(1, 1);
          // O texto já vem formatado com quebras de linha corretas (\r\n)
          printer.text(text);
          
          if (qrCodeUrl) {
            printer.align("ct").qrcode(qrCodeUrl, 2, 6, "M");
          }
          
          printer.cut().close((closeErr: Error | null) => {
            if (closeErr) {
              return reject(new Error(`Falha ao fechar impressora: ${closeErr.message}`));
            }
            resolve();
          });
        } catch (printError) {
          reject(printError);
        }
      });
    });

    logger.info("Cupom impresso com sucesso via USB (com QR Code).");
    return { ok: true, erro: null, metodo: "usb" };
  } catch (usbError: any) {
    logger.warn(`Falha ao imprimir via USB/ESCpos: ${usbError.message}. Tentando fallback via PowerShell.`);
    await printTextToWindowsPrinter(text);
    logger.info("Cupom impresso via fallback (PowerShell, sem QR Code).");
    // Retorna sucesso, mas informa que o QR Code não foi impresso.
    return { ok: true, erro: "QR Code não impresso (fallback de impressão).", metodo: "fallback" };
  }
}

router.post("/teste", async (_req, res) => {
  try {
    const printerName = await resolvePrinterName();
    const text = `ARVOREDO\r\nTeste de Impressao\r\nImpressora: ${printerName}\r\nHorario: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\r\n\r\nSe o cupom sair, a impressora esta conectada.`;
    const result = await printCupomWithQrCode(text);
    return res.json({ ...result, impressora: printerName });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao testar impressora";
    logger.error(`Erro na rota /teste: ${message}`);
    return res.status(500).json({ ok: false, erro: message });
  }
});

router.post("/cupom", async (req, res) => {
  try {
    const payload = ImprimirCupomBody.parse(req.body);
    const [venda] = await db.select().from(vendasTable).where(eq(vendasTable.id, payload.venda_id));

    if (!venda) {
      return res.status(404).json({ ok: false, erro: "Venda não encontrada" });
    }

    const itens = await db
      .select()
      .from(itensVendaTable)
      .where(eq(itensVendaTable.venda_id, payload.venda_id));

    let clienteNome: string | undefined;
    if (venda.cliente_id) {
      const [cliente] = await db
        .select()
        .from(clientesTable)
        .where(eq(clientesTable.id, venda.cliente_id));
      clienteNome = cliente?.nome;
    }

    let qrUrl: string | undefined;
    let chaveAcesso: string | undefined;
    try {
      const [nfceLog] = await db
        .select()
        .from(nfceLogsTable)
        .where(eq(nfceLogsTable.venda_id, payload.venda_id))
        .orderBy(desc(nfceLogsTable.id))
        .limit(1);

      if (nfceLog?.status === "autorizada" && nfceLog.chave_acesso) {
        chaveAcesso = nfceLog.chave_acesso;
        // URL padrão SEFAZ RS para consulta NFC-e
        qrUrl = `https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?P=${nfceLog.chave_acesso}|2|1|1|`;
      }
    } catch {
      // sem NFC-e autorizada — imprime sem QR
    }

    const text = await buildCupomText(venda, itens, clienteNome, chaveAcesso);
    const result = await printCupomWithQrCode(text, qrUrl);
    
    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro de impressão do cupom";
    logger.error(`Erro na rota /cupom: ${message}`);
    return res.status(500).json({ ok: false, erro: message });
  }
});

router.post("/sangria", async (req, res) => {
  try {
    const payload = ImprimirSangriaBody.parse(req.body);
    const start = new Date(payload.data_inicio);
    const end = new Date(payload.data_fim);
    end.setHours(23, 59, 59, 999);

    const conditions = [gte(vendasTable.criado_em, start), lte(vendasTable.criado_em, end)];
    if (payload.sessao_id != null) {
      conditions.push(eq(vendasTable.sessao_id, payload.sessao_id));
    }

    const vendas = await db.select().from(vendasTable).where(and(...conditions));
    const sangrias = await db
      .select()
      .from(sangriasTable)
      .where(and(gte(sangriasTable.criado_em, start), lte(sangriasTable.criado_em, end)));

    const text = buildSangriaText(payload, vendas, sangrias);
    await printTextToWindowsPrinter(text);
    return res.json({ ok: true, erro: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro de impressão da sangria";
    return res.status(500).json({ ok: false, erro: message });
  }
});

export default router;