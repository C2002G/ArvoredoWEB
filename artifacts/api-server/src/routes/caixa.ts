import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessoesCaixaTable, sangriasTable, vendasTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { AbrirCaixaBody, RegistrarSangriaBody } from "@workspace/api-zod";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { itensVendaTable } from "@workspace/db/schema";

const router: IRouter = Router();

function formatSessao(s: typeof sessoesCaixaTable.$inferSelect) {
  return {
    ...s,
    aberto_em: s.aberto_em.toISOString(),
    fechado_em: s.fechado_em?.toISOString() ?? null,
  };
}

router.get("/:sessaoId/relatorio.xlsx", async (req, res) => {
  const sessaoId = Number(req.params.sessaoId);
  const [sessao] = await db.select().from(sessoesCaixaTable).where(eq(sessoesCaixaTable.id, sessaoId));
  if (!sessao) return res.status(404).json({ ok: false, message: "Sessão não encontrada" });

  const vendas = await db.select().from(vendasTable).where(eq(vendasTable.sessao_id, sessaoId));
  const sangriasSessao = await db.select().from(sangriasTable).where(eq(sangriasTable.sessao_id, sessaoId));

  const wb = new ExcelJS.Workbook();

  const resumo = wb.addWorksheet("Resumo");
  resumo.addRows([
    ["Sessão", sessaoId],
    ["Abertura", sessao.aberto_em.toLocaleString("pt-BR")],
    ["Fechamento", sessao.fechado_em?.toLocaleString("pt-BR") ?? "Aberta"],
    ["Fundo inicial", sessao.fundo_inicial],
    ["Dinheiro", sessao.total_dinheiro],
    ["PIX", sessao.total_pix],
    ["Cartão", sessao.total_cartao],
    ["Fiado", sessao.total_fiado],
    ["Sangrias", sessao.total_sangria],
  ]);

  const abaVendas = wb.addWorksheet("Vendas");
  abaVendas.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Hora", key: "hora", width: 20 },
    { header: "Categoria", key: "categoria", width: 12 },
    { header: "Pagamento", key: "pagamento", width: 12 },
    { header: "Total", key: "total", width: 12 },
    { header: "Desconto", key: "desconto", width: 10 },
  ];
  abaVendas.addRows(vendas.map(v => ({
    id: v.id, hora: v.criado_em.toLocaleString("pt-BR"),
    categoria: v.categoria, pagamento: v.pagamento, total: v.total, desconto: v.desconto,
  })));

  const abaSangrias = wb.addWorksheet("Sangrias");
  abaSangrias.columns = [
    { header: "Hora", key: "hora", width: 20 },
    { header: "Valor", key: "valor", width: 12 },
    { header: "Motivo", key: "motivo", width: 30 },
  ];
  abaSangrias.addRows(sangriasSessao.map(s => ({
    hora: s.criado_em.toLocaleString("pt-BR"), valor: s.valor, motivo: s.motivo ?? "",
  })));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=caixa-${sessaoId}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

router.get("/status", async (_req, res) => {
  const [sessao] = await db
    .select()
    .from(sessoesCaixaTable)
    .where(eq(sessoesCaixaTable.status, "aberto"))
    .limit(1);

  res.json({
    aberto: !!sessao,
    sessao: sessao ? formatSessao(sessao) : null,
  });
});

router.post("/abrir", async (req, res) => {
  const [existente] = await db
    .select()
    .from(sessoesCaixaTable)
    .where(eq(sessoesCaixaTable.status, "aberto"))
    .limit(1);

  if (existente) {
    res.status(400).json({ ok: false, message: "Já existe um caixa aberto" });
    return;
  }

  const data = AbrirCaixaBody.parse(req.body);
  const [sessao] = await db
    .insert(sessoesCaixaTable)
    .values({ fundo_inicial: data.fundo_inicial ?? 0 })
    .returning();

  res.status(201).json(formatSessao(sessao));
});

router.post("/fechar", async (_req, res) => {
  const [sessao] = await db
    .select()
    .from(sessoesCaixaTable)
    .where(eq(sessoesCaixaTable.status, "aberto"))
    .limit(1);

  if (!sessao) {
    res.status(400).json({ ok: false, message: "Nenhum caixa aberto" });
    return;
  }

  const [fechada] = await db
    .update(sessoesCaixaTable)
    .set({ status: "fechado", fechado_em: new Date() })
    .where(eq(sessoesCaixaTable.id, sessao.id))
    .returning();

  res.json(formatSessao(fechada));
});

router.post("/sangria", async (req, res) => {
  const [sessao] = await db
    .select()
    .from(sessoesCaixaTable)
    .where(eq(sessoesCaixaTable.status, "aberto"))
    .limit(1);

  if (!sessao) {
    res.status(400).json({ ok: false, message: "Nenhum caixa aberto" });
    return;
  }

  const data = RegistrarSangriaBody.parse(req.body);

  const [sangria] = await db
    .insert(sangriasTable)
    .values({
      sessao_id: sessao.id,
      valor: data.valor,
      motivo: data.motivo ?? null,
    })
    .returning();

  await db
    .update(sessoesCaixaTable)
    .set({ total_sangria: sql`total_sangria + ${data.valor}` })
    .where(eq(sessoesCaixaTable.id, sessao.id));

  res.status(201).json({
    ...sangria,
    criado_em: sangria.criado_em.toISOString(),
  });
});

router.get("/sangrias", async (req, res) => {
  const { sessao_id } = req.query as { sessao_id?: string };
  const condition = sessao_id
    ? eq(sangriasTable.sessao_id, parseInt(sessao_id))
    : undefined;

  const sangrias = await db
    .select()
    .from(sangriasTable)
    .where(condition)
    .orderBy(desc(sangriasTable.criado_em));

  res.json(
    sangrias.map((s) => ({
      ...s,
      criado_em: s.criado_em.toISOString(),
    }))
  );
});

router.get("/historico", async (_req, res) => {
  const sessoes = await db
    .select()
    .from(sessoesCaixaTable)
    .orderBy(desc(sessoesCaixaTable.aberto_em))
    .limit(30);

  res.json(sessoes.map(formatSessao));
});

export default router;
