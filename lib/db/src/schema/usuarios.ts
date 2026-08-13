import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const usuariosTable = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  sobrenome: text("sobrenome"),
  usuario: text("usuario").notNull().unique(), // login
  senha_hash: text("senha_hash").notNull(),
  cor: text("cor").notNull().default("#3b82f6"), // hex, cor da bolinha
  ativo: boolean("ativo").notNull().default(true), 
  criado_em: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUsuarioSchema = createInsertSchema(usuariosTable).omit({
  id: true,
  criado_em: true,
  senha_hash: true,
});