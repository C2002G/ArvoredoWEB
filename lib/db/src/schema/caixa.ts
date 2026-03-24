import { pgTable, serial, real, timestamp, pgEnum, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const statusCaixaEnum = pgEnum("status_caixa", ["aberto", "fechado"]);

export const sessoesCaixaTable = pgTable("sessoes_caixa", {
  id: serial("id").primaryKey(),
  aberto_em: timestamp("aberto_em").notNull().defaultNow(),
  fechado_em: timestamp("fechado_em"),
  fundo_inicial: real("fundo_inicial").notNull().default(0),
  total_dinheiro: real("total_dinheiro").notNull().default(0),
  total_pix: real("total_pix").notNull().default(0),
  total_cartao: real("total_cartao").notNull().default(0),
  total_fiado: real("total_fiado").notNull().default(0),
  total_sangria: real("total_sangria").notNull().default(0),
  status: statusCaixaEnum("status").notNull().default("aberto"),
});

export const sangriasTable = pgTable("sangrias", {
  id: serial("id").primaryKey(),
  sessao_id: serial("sessao_id").references(() => sessoesCaixaTable.id),
  valor: real("valor").notNull(),
  motivo: text("motivo"),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
});

export const insertSessaoCaixaSchema = createInsertSchema(sessoesCaixaTable).omit({ id: true, aberto_em: true });
export const insertSangriaSchema = createInsertSchema(sangriasTable).omit({ id: true, criado_em: true });

export type SessaoCaixa = typeof sessoesCaixaTable.$inferSelect;
export type Sangria = typeof sangriasTable.$inferSelect;
export type InsertSangria = z.infer<typeof insertSangriaSchema>;
