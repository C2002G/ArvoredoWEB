import "dotenv/config";
import { db, pool } from "./src";
import { configFiscalTable } from "./src/schema";

async function seedFiscalConfig() {
  const [existing] = await db.select().from(configFiscalTable).limit(1);
  if (existing) {
    console.log("config_fiscal ja possui registro. Seed ignorado.");
    return;
  }

  await db.insert(configFiscalTable).values({
    razao_social: "PREENCHER_RAZAO_SOCIAL",
    nome_fantasia: "PREENCHER_NOME_FANTASIA",
    cnpj: "00000000000000",
    ie: "PREENCHER_INSCRICAO_ESTADUAL",
    crt: "1",
    endereco: "PREENCHER_ENDERECO",
    numero: "S/N",
    bairro: "PREENCHER_BAIRRO",
    cidade: "PREENCHER_CIDADE",
    uf: "RS",
    cep: "00000000",
    cod_municipio: "0000000",
    telefone: null,
    csc_id: "1",
    csc_token: "540EB3EB-1918-488D-8C7D-5FB4ABAF814C",
    caminho_certificado:
      process.env.CAMINHO_CERTIFICADO_A1 || "C:/caminho/para/seu_certificado.pfx",
    senha_certificado: process.env.SENHA_CERTIFICADO_A1 || "sua_senha_segura",
    ambiente: "homologacao",
  });

  console.log("Seed fiscal concluido com sucesso.");
}

seedFiscalConfig()
  .catch((err) => {
    console.error("Falha no seed fiscal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
