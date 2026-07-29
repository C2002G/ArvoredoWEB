import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { nfceLogsTable, vendasTable, itensVendaTable, clientesTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { reimprimirDanfeSimplificado } from "../services/danfe.service";

const router: IRouter = Router();

// Rota para consultar o status da NFC-e
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

// Rota para reimprimir o cupom ou DANFE
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
  const text = await buildCupomText(venda, itens, cliente?.nome, undefined, undefined); 
  await printTextToWindowsPrinter(text);
  res.json({ ok: true, message: "Cupom simples reimpresso (sem NFC-e autorizada)" });
});

// Rota de Cancelamento Integrada (Maquininha + Banco de Dados)
router.post("/:vendaId/cancelar", async (req, res) => {
  const vendaId = Number(req.params.vendaId);
  if (!Number.isFinite(vendaId)) {
    return res.status(400).json({ ok: false, message: "vendaId invalido" });
  }

  try {
    const [venda] = await db.select().from(vendasTable).where(eq(vendasTable.id, vendaId));
    if (!venda) {
      return res.status(404).json({ ok: false, message: "Venda não encontrada" });
    }

    let tefNegado = false;

    // Cartão E Pix passam pelo mesmo fluxo TEF/ControlPay — os dois
    // precisam acionar o cancelamento, não só cartão.
    if ((venda.pagamento === "cartao" || venda.pagamento === "pix") && venda.tef_intencao_id) {
      console.log(`[TEF] Iniciando cancelamento PayGo para Intenção: ${venda.tef_intencao_id}`);

      const baseUrl = process.env.CONTROLPAY_BASE_URL?.trim() || "https://sandbox.controlpay.com.br";
      const key = process.env.CONTROLPAY_KEY?.trim() || "";
      const terminalId = Number(process.env.CONTROLPAY_TERMINAL_ID) || 0;

      const respTef = await fetch(`${baseUrl}/webapi/Venda/CancelarVenda/?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intencaoVendaId: venda.tef_intencao_id,
          terminalId, // doc: mandatório, mesmo terminal da venda original
          aguardarTefIniciarTransacao: true,
          senhaTecnica: "314159",
        }),
      });

      if (!respTef.ok) throw new Error("Falha ao comunicar cancelamento com a PayGo");

      const tefData = (await respTef.json()) as any;
      const statusCancelamento = tefData?.intencaoVenda?.intencaoVendaStatus;
      console.log("[TEF] Status retornado pelo cancelamento:", statusCancelamento);

      // 20 = Cancelado (sucesso real). Qualquer outro valor aqui = o host
      // não efetivou — é exatamente o que o roteiro espera pro PIX.
      if (statusCancelamento?.id !== 20) {
        tefNegado = true;
        console.log("[TEF] Cancelamento negado pelo host.");
      }
    }

    await db.insert(nfceLogsTable).values({
      venda_id: vendaId,
      ambiente: "homologacao",
      status: "processando",
      mensagem_status_sefaz: tefNegado ? "TRANSAÇÃO NEGADA PELO HOST" : "Cancelamento solicitado (TEF acionado).",
    });

    if (tefNegado) {
      return res.status(402).json({ ok: false, message: "TRANSAÇÃO NEGADA PELO HOST" });
    }

    res.status(202).json({ ok: true, message: "Estorno acionado na maquininha. Siga as instruções no terminal físico." });
  } catch (error: any) {
    console.error("[CANCELAR] Erro:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

export default router;