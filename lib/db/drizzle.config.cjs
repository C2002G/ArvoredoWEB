const fs = require("fs");
const path = require("path");
const { defineConfig } = require("drizzle-kit");

// Raiz do monorepo (lib/db -> ../../)
const rootEnv = path.join(__dirname, "..", "..", ".env");
if (!process.env.DATABASE_URL && fs.existsSync(rootEnv)) {
  const text = fs.readFileSync(rootEnv, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
    if (m) {
      process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, "");
      break;
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

module.exports = defineConfig({
  schema: "./src/schema/**/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
