import { pgTable, serial, text, integer, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { vendasTable } from "./vendas";

export const ambienteSefazEnum = pgEnum("ambiente_sefaz", ["producao", "homologacao"]);
export const statusNfceEnum = pgEnum("status_nfce", ["processando", "autorizada", "rejeitada", "erro"]);

// Tabela para guardar a configuração fiscal da empresa
export const configFiscalTable = pgTable("config_fiscal", {
  id: serial("id").primaryKey(),
  razao_social: text("razao_social").notNull(),
  nome_fantasia: text("nome_fantasia").notNull(),
  cnpj: text("cnpj").notNull(),
  ie: text("ie").notNull(),
  crt: text("crt").notNull(), // Código de Regime Tributário (ex: "1" para Simples Nacional)
  endereco: text("endereco").notNull(),
  numero: text("numero").notNull(),
  bairro: text("bairro").notNull(),
  cidade: text("cidade").notNull(),
  uf: text("uf").notNull(),
  cep: text("cep").notNull(),
  cod_municipio: text("cod_municipio").notNull(),
  telefone: text("telefone"),
  csc_id: text("csc_id").notNull(),
  csc_token: text("csc_token").notNull(),
  caminho_certificado: text("caminho_certificado").notNull(),
  senha_certificado: text("senha_certificado").notNull(),
  ambiente: ambienteSefazEnum("ambiente").notNull().default("homologacao"),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
});

// Tabela para logar todas as tentativas de emissão de NFC-e
export const nfceLogsTable = pgTable("nfce_logs", {
  id: serial("id").primaryKey(),
  venda_id: integer("venda_id").notNull().references(() => vendasTable.id),
  status: statusNfceEnum("status").notNull().default("processando"),
  ambiente: ambienteSefazEnum("ambiente").notNull(),
  chave_acesso: text("chave_acesso"),
  protocolo: text("protocolo"),
  codigo_status_sefaz: integer("codigo_status_sefaz"),
  mensagem_status_sefaz: text("mensagem_status_sefaz"),
  xml_enviado: text("xml_enviado"),
  xml_autorizado: text("xml_autorizado"), // XML final com o protocolo
  json_retorno_sefaz: jsonb("json_retorno_sefaz"),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
});