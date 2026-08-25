import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notasImportadasTable = pgTable(
  "notas_importadas",
  {
    id: serial("id").primaryKey(),
    chave_nfe: text("chave_nfe"),
    itens_hash: text("itens_hash").notNull(),
    emitente: text("emitente"),
    qtd_itens: integer("qtd_itens").notNull().default(0),
    criado_em: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chaveNfeUniqueIdx: uniqueIndex("notas_importadas_chave_unique").on(table.chave_nfe),
    itensHashUniqueIdx: uniqueIndex("notas_importadas_hash_unique").on(table.itens_hash),
  })
);

export const insertNotaImportadaSchema = createInsertSchema(notasImportadasTable).omit({ id: true, criado_em: true });
export type InsertNotaImportada = z.infer<typeof insertNotaImportadaSchema>;
export type NotaImportada = typeof notasImportadasTable.$inferSelect;