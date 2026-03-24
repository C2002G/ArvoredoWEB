import { pgTable, serial, text, real, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoriaEnum = pgEnum("categoria", ["mercado", "cozinha"]);

export const produtosTable = pgTable("produtos", {
  id: serial("id").primaryKey(),
  codigo: text("codigo"),
  nome: text("nome").notNull(),
  marca: text("marca"),
  categoria: categoriaEnum("categoria").notNull().default("mercado"),
  preco: real("preco").notNull(),
  custo: real("custo").notNull().default(0),
  estoque: real("estoque").notNull().default(0),
  estoque_min: real("estoque_min").notNull().default(5),
  unidade: text("unidade").notNull().default("un"),
  ativo: boolean("ativo").notNull().default(true),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
});

export const insertProdutoSchema = createInsertSchema(produtosTable).omit({ id: true, criado_em: true });
export type InsertProduto = z.infer<typeof insertProdutoSchema>;
export type Produto = typeof produtosTable.$inferSelect;
