import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  vendasTable,
  itensVendaTable,
  produtosTable,
  sessoesCaixaTable,
  fiadosTable,
  clientesTable,
  nfceLogsTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { RegistrarVendaBody } from "@workspace/api-zod";
import { emitirNfce } from "../services/sefaz.service";
import { imprimirDanfeSimplificado } from "../services/danfe.service";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  const { data, data_inicio, data_fim, categoria, limit } = req.query as {
    data?: string;
    data_inicio?: string;
    data_fim?: string;
    categoria?: string;
    limit?: string;
  };

  const lim = Math.min(1000, Math.max(1, parseInt(limit ?? "500") || 500));
  const conditions = [];
  if (data) {
    const start = new Date(data);
    start.setHours(0, 0, 0, 0);
    const end = new Date(data);
    end.setHours(23, 59, 59, 999);
    conditions.push(gte(vendasTable.criado_em, start));
    conditions.push(lte(vendasTable.criado_em, end));
  }
  if (data_inicio) {
    const start = new Date(data_inicio);
    start.setHours(0, 0, 0, 0);
    conditions.push(gte(vendasTable.criado_em, start));
  }
  if (data_fim) {
    const end = new Date(data_fim);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(vendasTable.criado_em, end));
  }
  if (categoria) conditions.push(eq(vendasTable.categoria, categoria));

  const vendas = await db
    .select({ venda: vendasTable, cliente_nome: clientesTable.nome })
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
    })),
  );
});
router.get("/resumo/hoje", async (req, res) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const vendas = await db
    .select()
    .from(vendasTable)
    .where(and(gte(vendasTable.criado_em, hoje), lte(vendasTable.criado_em, amanha)));
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
  const itens = await db.select().from(itensVendaTable).where(eq(itensVendaTable.venda_id, id));
  res.json(itens);
});


router.post("/", async (req, res) => {
  const data = RegistrarVendaBody.parse(req.body);
  const rawBody = req.body as Record<string, unknown>;

  const sessao = await db.query.sessoesCaixaTable.findFirst({
    where: eq(sessoesCaixaTable.status, "aberto"),
  });

  const subtotal = data.itens.reduce((acc, item) => acc + item.quantidade * item.preco_unit, 0);
  const total = Math.max(0, subtotal - (data.desconto ?? 0));

  const [venda] = await db.insert(vendasTable)
    .values({
      sessao_id: sessao?.id ?? null,
      categoria: data.categoria,
      total,
      desconto: data.desconto ?? 0,
      pagamento: data.pagamento,
      cliente_id: data.cliente_id ?? null,
      observacao: data.observacao ?? null,
    })
    .returning();

  const insertedItensVenda: (typeof itensVendaTable.$inferSelect)[] = [];
  for (const item of data.itens) {
    const produto = await db.query.produtosTable.findFirst({ where: eq(produtosTable.id, item.produto_id) });
    if (!produto) continue;

    const nome_snap = produto.marca ? `${produto.nome} - ${produto.marca}` : produto.nome;

    const [insertedItem] = await db.insert(itensVendaTable).values({
      venda_id: venda.id,
      produto_id: item.produto_id,
      nome_snap,
      quantidade: item.quantidade,
      unidades: null,
      preco_unit: item.preco_unit,
      subtotal: item.quantidade * item.preco_unit,
    }).returning();
    insertedItensVenda.push(insertedItem);

    const qtdBaixaEstoque = item.quantidade;
    const novoEstoque = produto.estoque - qtdBaixaEstoque;
    await db.update(produtosTable).set({ estoque: novoEstoque }).where(eq(produtosTable.id, item.produto_id));
  }

  if (data.pagamento === "fiado" && data.cliente_id) {
    await db.insert(fiadosTable).values({
      cliente_id: data.cliente_id,
      venda_id: venda.id,
      valor: total,
      pago: false,
    });
  }

  if (sessao) {
    const updates: Record<string, number> = {};
    if (data.pagamento === "dinheiro") updates.total_dinheiro = sql`total_dinheiro + ${total}` as unknown as number;
    if (data.pagamento === "pix") updates.total_pix = sql`total_pix + ${total}` as unknown as number;
    if (data.pagamento === "cartao") updates.total_cartao = sql`total_cartao + ${total}` as unknown as number;
    if (data.pagamento === "fiado") updates.total_fiado = sql`total_fiado + ${total}` as unknown as number;

    if (Object.keys(updates).length > 0) {
      await db.update(sessoesCaixaTable).set(updates).where(eq(sessoesCaixaTable.id, sessao.id));
    }
  }
  
  // Responder imediatamente ao frontend
  res.status(201).json({
    ...venda,
    criado_em: venda.criado_em.toISOString(),
    danfe_impresso: false,
    nfce_status: "pendente",
  });

  // Processar NFC-e em background (não-bloqueante)
  setImmediate(async () => {
    try {
      console.log("[NFC-e background] iniciando para venda", venda.id);
      const produtosIds = data.itens.map((i) => i.produto_id);
      const produtos = await db.query.produtosTable.findMany({ where: inArray(produtosTable.id, produtosIds) });
      const cliente = venda.cliente_id ? await db.query.clientesTable.findFirst({ where: eq(clientesTable.id, venda.cliente_id) }) : null;

      const cpfNota = typeof rawBody.cpf_nota === "string" ? rawBody.cpf_nota.replace(/\D/g, "") : "";
      const vendaParaSefaz = {
        ...venda,
        observacao:
          cpfNota.length === 11
            ? `${venda.observacao ? `${venda.observacao} | ` : ""}CPF_NA_NOTA:${cpfNota}`
            : venda.observacao,
      };

      const emissao = await emitirNfce(vendaParaSefaz, insertedItensVenda, produtos, cliente);

      if (emissao.success && emissao.xmlAutorizado) {
        const printTimeoutMs = Number(process.env.DANFE_PRINT_TIMEOUT_MS || "12000");
        try {
          await Promise.race([
            imprimirDanfeSimplificado(emissao.qrCodeUrl || "", emissao.chaveAcesso || "", emissao.xmlAutorizado),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error(`Timeout da impressao DANFE (${printTimeoutMs}ms)`)),
                printTimeoutMs,
              ),
            ),
          ]);
        } catch (printError) {
          console.error("[NFC-e background] Falha ao imprimir DANFE:", printError);
        }
      }
    } catch (bgErr) {
      console.error("[NFC-e background] erro:", bgErr);
    }
  });
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: "id invalido" });
    return;
  }
  const payload = req.body as Partial<{
    pagamento: "dinheiro" | "pix" | "cartao" | "fiado";
    cliente_id: number | null;
    observacao: string | null;
  }>;
  const [updated] = await db
    .update(vendasTable)
    .set({
      pagamento: payload.pagamento,
      cliente_id: payload.cliente_id,
      observacao: payload.observacao,
    })
    .where(eq(vendasTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ ok: false, message: "Venda nao encontrada" });
    return;
  }
  res.json({ ...updated, criado_em: updated.criado_em.toISOString() });
});

export default router;