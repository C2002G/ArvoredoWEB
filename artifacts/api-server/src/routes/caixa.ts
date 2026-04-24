import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessoesCaixaTable, sangriasTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { AbrirCaixaBody, RegistrarSangriaBody } from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

function formatSessao(s: typeof sessoesCaixaTable.$inferSelect) {
  return {
    ...s,
    aberto_em: s.aberto_em.toISOString(),
    fechado_em: s.fechado_em?.toISOString() ?? null,
  };
}

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
