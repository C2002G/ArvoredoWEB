import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { nfceLogsTable, vendasTable, itensVendaTable, clientesTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { reimprimirDanfeSimplificado } from "../services/danfe.service";

const router: IRouter = Router();

router.get("/status/:vendaId", async (req, res) => {
  const vendaId = Number(req.params.vendaId);
  if (!Number.isFinite(vendaId)) {
    res.status(400).json({ ok: false, message: "vendaId invalido" });
    return;
  }

  const [log] = await db
    .select()
    .from(nfceLogsTable)
    .where(eq(nfceLogsTable.venda_id, vendaId))
    .orderBy(desc(nfceLogsTable.criado_em))
    .limit(1);

  if (!log) {
    res.json({ ok: true, status: "sem_emissao", log: null });
    return;
  }
  res.json({ ok: true, status: log.status, log });
});

router.post("/:vendaId/reimprimir", async (req, res) => {
  const vendaId = Number(req.params.vendaId);
  if (!Number.isFinite(vendaId)) {
    res.status(400).json({ ok: false, message: "vendaId invalido" });
    return;
  }

  const [log] = await db
    .select()
    .from(nfceLogsTable)
    .where(eq(nfceLogsTable.venda_id, vendaId))
    .orderBy(desc(nfceLogsTable.criado_em))
    .limit(1);

  if (log?.xml_autorizado) {
    await reimprimirDanfeSimplificado(log.xml_autorizado, undefined, log.chave_acesso || undefined);
    res.json({ ok: true, message: "DANFE reimpresso com sucesso" });
    return;
  }

  const [venda] = await db.select().from(vendasTable).where(eq(vendasTable.id, vendaId));
  if (!venda) {
    res.status(404).json({ ok: false, message: "Venda nao encontrada" });
    return;
  }

  const itens = await db.select().from(itensVendaTable).where(eq(itensVendaTable.venda_id, vendaId));
  const [cliente] = venda.cliente_id
    ? await db.select().from(clientesTable).where(eq(clientesTable.id, venda.cliente_id))
    : [undefined];

  const { buildCupomText } = await import("../lib/print-layout");
  const { printTextToWindowsPrinter } = await import("../lib/printer");
  const text = await buildCupomText(venda, itens, cliente?.nome); 
  await printTextToWindowsPrinter(text);
  res.json({ ok: true, message: "Cupom simples reimpresso (sem NFC-e autorizada)" });
});

router.post("/:vendaId/cancelar", async (req, res) => {
  const vendaId = Number(req.params.vendaId);
  if (!Number.isFinite(vendaId)) {
    res.status(400).json({ ok: false, message: "vendaId invalido" });
    return;
  }

  const [lastLog] = await db
    .select()
    .from(nfceLogsTable)
    .where(eq(nfceLogsTable.venda_id, vendaId))
    .orderBy(desc(nfceLogsTable.criado_em))
    .limit(1);

  await db.insert(nfceLogsTable).values({
    venda_id: vendaId,
    ambiente: lastLog?.ambiente || "homologacao",
    status: "erro",
    chave_acesso: lastLog?.chave_acesso || null,
    mensagem_status_sefaz:
      "Cancelamento NFC-e solicitado. Rota em modo esboco aguardando integracao node-dfe.",
  });

  res.status(202).json({
    ok: true,
    message: "Solicitacao de cancelamento registrada (esboco).",
  });
});

export default router;
