import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  vendasTable,
  itensVendaTable,
  produtosTable,
  sessoesCaixaTable,
  fiadosTable,
  clientesTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { RegistrarVendaBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  const { data, categoria, limit } = req.query as {
    data?: string;
    categoria?: string;
    limit?: string;
  };
  const lim = parseInt(limit ?? "50") || 50;

  const conditions = [];
  if (data) {
    const start = new Date(data);
    start.setHours(0, 0, 0, 0);
    const end = new Date(data);
    end.setHours(23, 59, 59, 999);
    conditions.push(gte(vendasTable.criado_em, start));
    conditions.push(lte(vendasTable.criado_em, end));
  }
  if (categoria) {
    conditions.push(eq(vendasTable.categoria, categoria));
  }

  const vendas = await db
    .select({
      venda: vendasTable,
      cliente_nome: clientesTable.nome,
    })
    .from(vendasTable)
    .leftJoin(clientesTable, eq(vendasTable.cliente_id, clientesTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(vendasTable.criado_em))
    .limit(lim);

  res.json(
    vendas.map(({ venda, cliente_nome }) => ({
      ...venda,
      cliente_nome,
      criado_em: venda.criado_em.toISOString(),
    }))
  );
});

router.get("/resumo/hoje", async (_req, res) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const vendas = await db
    .select()
    .from(vendasTable)
    .where(
      and(gte(vendasTable.criado_em, hoje), lte(vendasTable.criado_em, amanha))
    );

  const resumo = {
    total: 0,
    total_dinheiro: 0,
    total_pix: 0,
    total_cartao: 0,
    total_fiado: 0,
    num_vendas: vendas.length,
    mercado: 0,
    cozinha: 0,
    feira: 0,
  };

  for (const v of vendas) {
    resumo.total += v.total;
    if (v.pagamento === "dinheiro") resumo.total_dinheiro += v.total;
    if (v.pagamento === "pix") resumo.total_pix += v.total;
    if (v.pagamento === "cartao") resumo.total_cartao += v.total;
    if (v.pagamento === "fiado") resumo.total_fiado += v.total;
    if (v.categoria === "mercado") resumo.mercado += v.total;
    if (v.categoria === "cozinha") resumo.cozinha += v.total;
    if (v.categoria === "feira") resumo.feira += v.total;
  }

  res.json(resumo);
});

router.get("/:id/itens", async (req, res) => {
  const id = parseInt(req.params.id);
  const itens = await db
    .select()
    .from(itensVendaTable)
    .where(eq(itensVendaTable.venda_id, id));
  res.json(
    itens.map((i) => ({
      ...i,
    }))
  );
});

router.post("/", async (req, res) => {
  const data = RegistrarVendaBody.parse(req.body);

  const sessao = await db
    .select()
    .from(sessoesCaixaTable)
    .where(eq(sessoesCaixaTable.status, "aberto"))
    .limit(1);

  const sessao_id = sessao[0]?.id ?? null;

  const subtotal = data.itens.reduce(
    (acc, item) => acc + item.quantidade * item.preco_unit,
    0
  );
  const total = Math.max(0, subtotal - (data.desconto ?? 0));

  const [venda] = await db
    .insert(vendasTable)
    .values({
      sessao_id,
      categoria: data.categoria,
      total,
      desconto: data.desconto ?? 0,
      pagamento: data.pagamento,
      cliente_id: data.cliente_id ?? null,
      observacao: data.observacao ?? null,
    })
    .returning();

  for (const item of data.itens) {
    const [produto] = await db
      .select()
      .from(produtosTable)
      .where(eq(produtosTable.id, item.produto_id));

    if (!produto) continue;

    const nome_snap = produto.marca
      ? `${produto.nome} - ${produto.marca}`
      : produto.nome;

    const uProd = (produto.unidade || "").trim().toLowerCase();
    const isFeiraPeca =
      produto.categoria === "feira" &&
      (uProd === "un" || uProd === "un." || uProd === "pc" || uProd === "pç" || uProd === "pec");
    const un = item.unidades;
    const qtdBaixaEstoque = isFeiraPeca
      ? un != null && un > 0
        ? un
        : item.quantidade
      : item.quantidade;

    await db.insert(itensVendaTable).values({
      venda_id: venda.id,
      produto_id: item.produto_id,
      nome_snap,
      quantidade: item.quantidade,
      unidades: produto.categoria === "feira" && un != null && un > 0 ? un : null,
      preco_unit: item.preco_unit,
      subtotal: item.quantidade * item.preco_unit,
    });

    const novoEstoque = produto.estoque - qtdBaixaEstoque;
    if (novoEstoque < 0) {
      req.log.warn({ produto_id: produto.id, estoque: novoEstoque }, "Estoque negativo");
    }
    await db
      .update(produtosTable)
      .set({ estoque: novoEstoque })
      .where(eq(produtosTable.id, item.produto_id));
  }

  if (data.pagamento === "fiado" && data.cliente_id) {
    await db.insert(fiadosTable).values({
      cliente_id: data.cliente_id,
      venda_id: venda.id,
      valor: total,
      pago: false,
    });
  }

  if (sessao_id) {
    const updates: Record<string, number> = {};
    if (data.pagamento === "dinheiro") updates.total_dinheiro = sql`total_dinheiro + ${total}` as unknown as number;
    if (data.pagamento === "pix") updates.total_pix = sql`total_pix + ${total}` as unknown as number;
    if (data.pagamento === "cartao") updates.total_cartao = sql`total_cartao + ${total}` as unknown as number;
    if (data.pagamento === "fiado") updates.total_fiado = sql`total_fiado + ${total}` as unknown as number;

    if (Object.keys(updates).length > 0) {
      await db
        .update(sessoesCaixaTable)
        .set(updates)
        .where(eq(sessoesCaixaTable.id, sessao_id));
    }
  }

  res.status(201).json({
    ...venda,
    cliente_nome: null,
    criado_em: venda.criado_em.toISOString(),
  });
});

export default router;
