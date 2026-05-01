import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { produtosTable } from "@workspace/db/schema";
import { eq, ilike, lte, or, and } from "drizzle-orm";
import {
  CriarProdutoBody,
  EditarProdutoBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function normalizeCodigo(codigo: string | null | undefined) {
  const trimmed = codigo?.trim();
  return trimmed ? trimmed : null;
}

function isUniqueViolation(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  const detail = (err as { detail?: string }).detail ?? "";
  return code === "23505" && detail.includes("(codigo)");
}

router.get("/", async (req, res) => {
  const { q, categoria } = req.query as { q?: string; categoria?: string };
  const conditions = [eq(produtosTable.ativo, true)];
  if (categoria === "mercado" || categoria === "cozinha" || categoria === "feira") {
    conditions.push(eq(produtosTable.categoria, categoria));
  }
  if (q) {
    conditions.push(
      or(
        ilike(produtosTable.codigo, `%${q}%`),
        ilike(produtosTable.nome, `%${q}%`),
        ilike(produtosTable.marca, `%${q}%`)
      )!
    );
  }
  const produtos = await db.select().from(produtosTable).where(and(...conditions));
  res.json(produtos.map(formatProduto));
});

router.get("/busca", async (req, res) => {
  const { codigo, nome } = req.query as { codigo?: string; nome?: string };
  const conditions = [eq(produtosTable.ativo, true)];
  if (codigo) {
    conditions.push(eq(produtosTable.codigo, codigo.trim()));
  } else if (nome) {
    conditions.push(
      or(
        ilike(produtosTable.codigo, `%${nome}%`),
        ilike(produtosTable.nome, `%${nome}%`),
        ilike(produtosTable.marca, `%${nome}%`)
      )!
    );
  }
  const produtos = await db.select().from(produtosTable).where(and(...conditions));
  res.json(produtos.map(formatProduto));
});

router.get("/alertas", async (_req, res) => {
  const produtos = await db
    .select()
    .from(produtosTable)
    .where(and(eq(produtosTable.ativo, true), lte(produtosTable.estoque, produtosTable.estoque_min)));
  res.json(produtos.map(formatProduto));
});

router.post("/", async (req, res) => {
  const data = CriarProdutoBody.parse(req.body);
  const rawBody = req.body as Record<string, unknown>;
  try {
    const [produto] = await db
      .insert(produtosTable)
      .values({
        ...data,
        unidade: data.categoria === "feira" ? "kg" : data.unidade,
        codigo: normalizeCodigo(data.codigo),
        cfop: typeof rawBody.cfop === "string" ? rawBody.cfop : undefined,
        cest: typeof rawBody.cest === "string" ? rawBody.cest : undefined,
      })
      .returning();
    res.status(201).json(formatProduto(produto));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({
        ok: false,
        message: "Código de barras já cadastrado para outro produto",
      });
      return;
    }
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const data = EditarProdutoBody.parse(req.body);
  const rawBody = req.body as Record<string, unknown>;
  let produto;
  try {
    [produto] = await db
      .update(produtosTable)
      .set({
        ...data,
        ...(data.categoria === "feira" ? { unidade: "kg" } : {}),
        ...(data.codigo !== undefined ? { codigo: normalizeCodigo(data.codigo) } : {}),
        ...(typeof rawBody.cfop === "string" ? { cfop: rawBody.cfop } : {}),
        ...(typeof rawBody.cest === "string" ? { cest: rawBody.cest } : {}),
      })
      .where(eq(produtosTable.id, id))
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({
        ok: false,
        message: "Código de barras já cadastrado para outro produto",
      });
      return;
    }
    throw err;
  }
  if (!produto) {
    res.status(404).json({ ok: false, message: "Produto não encontrado" });
    return;
  }
  res.json(formatProduto(produto));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(produtosTable).set({ ativo: false }).where(eq(produtosTable.id, id));
  res.json({ ok: true, message: "Produto desativado" });
});

function formatProduto(p: typeof produtosTable.$inferSelect) {
  return {
    ...p,
    criado_em: p.criado_em.toISOString(),
  };
}

export default router;
