// in: artifacts/api-server/src/routes/vendas.ts
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
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { RegistrarVendaBody } from "@workspace/api-zod";
import { emitirNfce } from "../services/sefaz.service";
import { imprimirDanfeSimplificado } from "../services/danfe.service";

const router: IRouter = Router();

// ... (as rotas GET não mudam e estão corretas)
router.get("/", async (req, res) => {
    // ...
});
router.get("/resumo/hoje", async (req, res) => {
    // ...
});
router.get("/:id/itens", async (req, res) => {
    // ...
});


router.post("/", async (req, res) => {
  const data = RegistrarVendaBody.parse(req.body);

  const sessao = await db.query.sessoesCaixaTable.findFirst({
    where: eq(sessoesCaixaTable.status, "aberto"),
  });

  const subtotal = data.itens.reduce((acc, item) => acc + item.quantidade * item.preco_unit, 0);
  const total = Math.max(0, subtotal - (data.desconto ?? 0));

  // CORREÇÃO: Mapear 'debito' e 'credito' para 'cartao' antes de salvar no banco
  const pagamentoParaSalvar = (data.pagamento === "debito" || data.pagamento === "credito") ? "cartao" : data.pagamento;

  const [venda] = await db.insert(vendasTable)
    .values({
      sessao_id: sessao?.id ?? null,
      categoria: data.categoria,
      total,
      desconto: data.desconto ?? 0,
      pagamento: pagamentoParaSalvar, // Usar a variável corrigida
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
      unidades: item.unidades,
      preco_unit: item.preco_unit,
      subtotal: item.quantidade * item.preco_unit,
    }).returning();
    insertedItensVenda.push(insertedItem);

    const qtdBaixaEstoque = (produto.categoria === "feira" && item.unidades != null && item.unidades > 0) ? item.unidades : item.quantidade;
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
    // CORREÇÃO: Atualizar o total_cartao para débito e crédito
    const updates: Partial<typeof sessoesCaixaTable.$inferInsert> = {};
    if (data.pagamento === "dinheiro") updates.total_dinheiro = sql`total_dinheiro + ${total}`;
    if (data.pagamento === "pix") updates.total_pix = sql`total_pix + ${total}`;
    if (data.pagamento === "debito" || data.pagamento === "credito") updates.total_cartao = sql`total_cartao + ${total}`;
    if (data.pagamento === "fiado") updates.total_fiado = sql`total_fiado + ${total}`;

    if (Object.keys(updates).length > 0) {
      await db.update(sessoesCaixaTable).set(updates).where(eq(sessoesCaixaTable.id, sessao.id));
    }
  }
  
  try {
    const produtosIds = data.itens.map((i) => i.produto_id);
    const produtos = await db.query.produtosTable.findMany({ where: inArray(produtosTable.id, produtosIds) });
    const cliente = venda.cliente_id ? await db.query.clientesTable.findFirst({ where: eq(clientesTable.id, venda.cliente_id) }) : null;

    // A venda original (com debito/credito) é passada para a SEFAZ
    const vendaParaSefaz = { ...venda, pagamento: data.pagamento };

    const emissao = await emitirNfce(vendaParaSefaz, insertedItensVenda, produtos, cliente);

    if (emissao.success && emissao.xmlAutorizado) {
      await imprimirDanfeSimplificado(emissao.qrCodeUrl || "", emissao.chaveAcesso || "", emissao.xmlAutorizado);
    }
    res.status(201).json({ ...venda, criado_em: venda.criado_em.toISOString(), nfce_status: 'autorizada' });
  } catch (error: any) {
    req.log.error({ err: error, vendaId: venda.id }, "Falha ao emitir NFC-e ou imprimir.");
    await db.update(vendasTable).set({ observacao: `FALHA FISCAL: ${error.message}` }).where(eq(vendasTable.id, venda.id));
    res.status(201).json({ ...venda, criado_em: venda.criado_em.toISOString(), nfce_status: 'erro', nfce_mensagem: error.message });
  }
});

export default router;