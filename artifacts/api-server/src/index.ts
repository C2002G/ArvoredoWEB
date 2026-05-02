process.env.TZ = "America/Sao_Paulo";

import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { runStartupMigrations } from "./migrate";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

runStartupMigrations()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ now: new Date().toString(), tz: process.env.TZ }, "Timezone configured");
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Falha nas migrações de startup; encerrando");
    process.exit(1);
  });
