import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

/**
 * Garante colunas esperadas pelo código (ex.: pull em PC que ainda não rodou o SQL manual).
 */
export async function runStartupMigrations(): Promise<void> {
  await pool.query(
    "ALTER TABLE itens_venda ADD COLUMN IF NOT EXISTS unidades real",
  );
  logger.info("Migrações de startup OK (itens_venda.unidades)");
}
