import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { produtosTable, movimentosEstoqueTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { MovimentarEstoqueBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/movimento", async (req, res) => {
  const data = MovimentarEstoqueBody.parse(req.body);

  const [produto] = await db
    .select()
    .from(produtosTable)
    .where(eq(produtosTable.id, data.produto_id));

  if (!produto) {
    res.status(404).json({ ok: false, message: "Produto não encontrado" });
    return;
  }

  let novoEstoque = produto.estoque;
  if (data.tipo === "entrada") novoEstoque += data.quantidade;
  else if (data.tipo === "saida") novoEstoque -= data.quantidade;
  else if (data.tipo === "ajuste") novoEstoque = data.quantidade;

  await db
    .update(produtosTable)
    .set({ estoque: novoEstoque })
    .where(eq(produtosTable.id, data.produto_id));

  const [movimento] = await db
    .insert(movimentosEstoqueTable)
    .values({
      produto_id: data.produto_id,
      tipo: data.tipo,
      quantidade: data.quantidade,
      motivo: data.motivo ?? null,
    })
    .returning();

  res.status(201).json({
    ...movimento,
    produto_nome: produto.marca ? `${produto.nome} - ${produto.marca}` : produto.nome,
    criado_em: movimento.criado_em.toISOString(),
  });
});

router.get("/movimentos", async (req, res) => {
  const { produto_id, limit } = req.query as { produto_id?: string; limit?: string };
  const lim = parseInt(limit ?? "100") || 100;

  let query = db
    .select({
      movimento: movimentosEstoqueTable,
      produto_nome: produtosTable.nome,
      produto_marca: produtosTable.marca,
    })
    .from(movimentosEstoqueTable)
    .leftJoin(produtosTable, eq(movimentosEstoqueTable.produto_id, produtosTable.id))
    .orderBy(desc(movimentosEstoqueTable.criado_em))
    .limit(lim);

  if (produto_id) {
    query = query.where(eq(movimentosEstoqueTable.produto_id, parseInt(produto_id))) as typeof query;
  }

  const movimentos = await query;

  res.json(
    movimentos.map(({ movimento, produto_nome, produto_marca }) => ({
      ...movimento,
      produto_nome: produto_nome
        ? produto_marca
          ? `${produto_nome} - ${produto_marca}`
          : produto_nome
        : null,
      criado_em: movimento.criado_em.toISOString(),
    }))
  );
});

export default router;
