import { pgTable, serial, text, real, boolean, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sessoesCaixaTable } from "./caixa";
import { clientesTable } from "./clientes";
import { produtosTable } from "./produtos";

export const pagamentoEnum = pgEnum("pagamento", ["dinheiro", "pix", "cartao", "fiado"]);
export const tipoMovimentoEnum = pgEnum("tipo_movimento", ["entrada", "saida", "ajuste"]);

export const vendasTable = pgTable("vendas", {
  id: serial("id").primaryKey(),
  sessao_id: integer("sessao_id").references(() => sessoesCaixaTable.id),
  categoria: text("categoria").notNull(),
  total: real("total").notNull(),
  desconto: real("desconto").notNull().default(0),
  pagamento: pagamentoEnum("pagamento").notNull(),
  cliente_id: integer("cliente_id").references(() => clientesTable.id),
  observacao: text("observacao"),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
});

export const itensVendaTable = pgTable("itens_venda", {
  id: serial("id").primaryKey(),
  venda_id: integer("venda_id").notNull().references(() => vendasTable.id),
  produto_id: integer("produto_id").notNull().references(() => produtosTable.id),
  nome_snap: text("nome_snap").notNull(),
  quantidade: real("quantidade").notNull(),
  preco_unit: real("preco_unit").notNull(),
  subtotal: real("subtotal").notNull(),
});

export const fiadosTable = pgTable("fiados", {
  id: serial("id").primaryKey(),
  cliente_id: integer("cliente_id").notNull().references(() => clientesTable.id),
  venda_id: integer("venda_id").references(() => vendasTable.id),
  valor: real("valor").notNull(),
  pago: boolean("pago").notNull().default(false),
  pago_em: timestamp("pago_em"),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
});

export const movimentosEstoqueTable = pgTable("movimentos_estoque", {
  id: serial("id").primaryKey(),
  produto_id: integer("produto_id").notNull().references(() => produtosTable.id),
  tipo: tipoMovimentoEnum("tipo").notNull(),
  quantidade: real("quantidade").notNull(),
  motivo: text("motivo"),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
});

export const insertVendaSchema = createInsertSchema(vendasTable).omit({ id: true, criado_em: true });
export const insertItemVendaSchema = createInsertSchema(itensVendaTable).omit({ id: true });
export const insertFiadoSchema = createInsertSchema(fiadosTable).omit({ id: true, criado_em: true });
export const insertMovimentoEstoqueSchema = createInsertSchema(movimentosEstoqueTable).omit({ id: true, criado_em: true });

export type Venda = typeof vendasTable.$inferSelect;
export type ItemVenda = typeof itensVendaTable.$inferSelect;
export type Fiado = typeof fiadosTable.$inferSelect;
export type MovimentoEstoque = typeof movimentosEstoqueTable.$inferSelect;
export type InsertVenda = z.infer<typeof insertVendaSchema>;
export type InsertItemVenda = z.infer<typeof insertItemVendaSchema>;
