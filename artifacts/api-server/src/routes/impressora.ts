import { Router } from "express";
import { db } from "@workspace/db";
import {
  ImprimirCupomBody,
  ImprimirSangriaBody,
} from "@workspace/api-zod";
import {
  vendasTable,
  itensVendaTable,
  clientesTable,
  sangriasTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { printTextToWindowsPrinter, resolvePrinterName } from "../lib/printer";
import { buildCupomText, buildSangriaText } from "../lib/print-layout";

const router = Router();

router.post("/teste", async (_req, res) => {
  try {
    const printer = await resolvePrinterName();
    const text = `ARVOREDO\r\nTeste de Impressao\r\nImpressora: ${printer}\r\n\r\nSe o cupom sair, a impressora esta conectada.`;
    await printTextToWindowsPrinter(text, printer);
    return res.json({ ok: true, erro: null, impressora: printer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao testar impressora";
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

    const text = buildCupomText(venda, itens, clienteNome);
    await printTextToWindowsPrinter(text);
    return res.json({ ok: true, erro: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro de impressão do cupom";
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
