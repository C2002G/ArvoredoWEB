import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientesTable, fiadosTable } from "@workspace/db/schema";
import { eq, ilike, and, desc, sql } from "drizzle-orm";
import { CriarClienteBody, PagarFiadoBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clientes", async (req, res) => {
  const { q } = req.query as { q?: string };
  const condition = q ? ilike(clientesTable.nome, `%${q}%`) : undefined;
  const clientes = await db
    .select()
    .from(clientesTable)
    .where(condition)
    .orderBy(clientesTable.nome);
  res.json(
    clientes.map((c) => ({
      ...c,
      criado_em: c.criado_em.toISOString(),
    }))
  );
});

router.post("/clientes", async (req, res) => {
  const data = CriarClienteBody.parse(req.body);
  const [cliente] = await db.insert(clientesTable).values(data).returning();
  res.status(201).json({ ...cliente, criado_em: cliente.criado_em.toISOString() });
});

router.put("/clientes/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const data = CriarClienteBody.parse(req.body);
  const [cliente] = await db
    .update(clientesTable)
    .set(data)
    .where(eq(clientesTable.id, id))
    .returning();
  if (!cliente) return res.status(404).json({ ok: false, message: "Cliente não encontrado" });
  res.json({ ...cliente, criado_em: cliente.criado_em.toISOString() });
});

router.get("/clientes/:id/extrato", async (req, res) => {
  const id = parseInt(req.params.id);
  const [cliente] = await db
    .select()
    .from(clientesTable)
    .where(eq(clientesTable.id, id));
  if (!cliente) return res.status(404).json({ ok: false, message: "Cliente não encontrado" });

  const fiados = await db
    .select()
    .from(fiadosTable)
    .where(eq(fiadosTable.cliente_id, id))
    .orderBy(fiadosTable.criado_em);

  const total_aberto = fiados
    .filter((f) => !f.pago)
    .reduce((acc, f) => acc + f.valor, 0);

  res.json({
    cliente: { ...cliente, criado_em: cliente.criado_em.toISOString() },
    fiados: fiados.map((f) => ({
      ...f,
      criado_em: f.criado_em.toISOString(),
      pago_em: f.pago_em?.toISOString() ?? null,
    })),
    total_aberto,
  });
});

router.post("/clientes/:id/pagar", async (req, res) => {
  const id = parseInt(req.params.id);
  const { valor } = PagarFiadoBody.parse(req.body);

  const fiados = await db
    .select()
    .from(fiadosTable)
    .where(and(eq(fiadosTable.cliente_id, id), eq(fiadosTable.pago, false)))
    .orderBy(fiadosTable.criado_em);

  let restante = valor;
  for (const fiado of fiados) {
    if (restante <= 0) break;
    if (restante >= fiado.valor) {
      await db
        .update(fiadosTable)
        .set({ pago: true, pago_em: new Date() })
        .where(eq(fiadosTable.id, fiado.id));
      restante -= fiado.valor;
    } else {
      const valorRestante = fiado.valor - restante;
      await db
        .update(fiadosTable)
        .set({ valor: valorRestante })
        .where(eq(fiadosTable.id, fiado.id));
      await db.insert(fiadosTable).values({
        cliente_id: id,
        venda_id: fiado.venda_id,
        valor: restante,
        pago: true,
        pago_em: new Date(),
      });
      restante = 0;
    }
  }

  res.json({ ok: true, message: "Pagamento registrado" });
});

router.get("/resumo", async (_req, res) => {
  const resultado = await db
    .select({
      cliente: clientesTable,
      total_aberto: sql<number>`sum(${fiadosTable.valor})`.as("total_aberto"),
    })
    .from(fiadosTable)
    .innerJoin(clientesTable, eq(fiadosTable.cliente_id, clientesTable.id))
    .where(eq(fiadosTable.pago, false))
    .groupBy(clientesTable.id)
    .orderBy(desc(sql`sum(${fiadosTable.valor})`));

  res.json(
    resultado.map(({ cliente, total_aberto }) => ({
      cliente: { ...cliente, criado_em: cliente.criado_em.toISOString() },
      total_aberto,
    }))
  );
});

export default router;
