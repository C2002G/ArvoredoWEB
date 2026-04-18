import { Router, type IRouter } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";

type ModoConexao = "manual" | "api" | "usb_bridge";

type MaquininhaConfig = {
  ativo: boolean;
  modo_conexao: ModoConexao;
  api_url: string;
  api_token: string;
  timeout_ms: number;
  empresa_nome: string;
  empresa_cnpj: string;
  empresa_regra_padrao: string;
};

const router: IRouter = Router();

const CONFIG_PATH = path.resolve(process.cwd(), "data", "maquininha-config.json");
const DEFAULT_CONFIG: MaquininhaConfig = {
  ativo: true,
  modo_conexao: "manual",
  api_url: "",
  api_token: "",
  timeout_ms: 8000,
  empresa_nome: "NOME DA EMPRESA",
  empresa_cnpj: "00.000.000/0000-00",
  empresa_regra_padrao: "Venda presencial. Confirmar manualmente no PDV apos aprovacao na maquininha.",
};

async function loadConfig(): Promise<MaquininhaConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<MaquininhaConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(config: MaquininhaConfig): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

router.get("/config", async (_req, res) => {
  const config = await loadConfig();
  res.json(config);
});

router.post("/config", async (req, res) => {
  const current = await loadConfig();
  const body = (req.body ?? {}) as Partial<MaquininhaConfig>;
  const merged: MaquininhaConfig = {
    ...current,
    ...body,
    timeout_ms: Math.max(1500, Number(body.timeout_ms ?? current.timeout_ms ?? 8000)),
  };
  await saveConfig(merged);
  res.json({ ok: true, config: merged });
});

router.post("/enviar", async (req, res) => {
  const config = await loadConfig();

  const payload = req.body as {
    venda_local_id?: string;
    metodo: "debito" | "credito" | "pix";
    valor_total: number;
    desconto?: number;
    itens: Array<{
      produto_id: number;
      nome: string;
      quantidade: number;
      preco_unit: number;
      subtotal: number;
    }>;
  };

  const envio = {
    origem: "arvoredo-pdv",
    enviado_em: new Date().toISOString(),
    empresa: {
      nome: config.empresa_nome,
      cnpj: config.empresa_cnpj,
      regra: config.empresa_regra_padrao,
    },
    pedido: {
      venda_local_id: payload.venda_local_id ?? null,
      metodo: payload.metodo,
      valor_total: payload.valor_total,
      desconto: payload.desconto ?? 0,
      itens: payload.itens ?? [],
    },
  };

  if (!config.ativo) {
    return res.json({
      ok: false,
      enviado: false,
      modo: config.modo_conexao,
      mensagem: "Integracao de maquininha esta desativada.",
    });
  }

  if (config.modo_conexao !== "api") {
    return res.json({
      ok: true,
      enviado: false,
      modo: config.modo_conexao,
      mensagem:
        "Solicitacao preparada. Conexao nao-API exige middleware do fabricante ou uso manual na maquininha.",
      payload_preview: envio,
    });
  }

  if (!config.api_url) {
    return res.status(400).json({
      ok: false,
      enviado: false,
      modo: config.modo_conexao,
      mensagem: "Defina a URL da API/gateway da maquininha em Dispositivos.",
    });
  }

  try {
    const response = await fetch(config.api_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.api_token ? { Authorization: `Bearer ${config.api_token}` } : {}),
      },
      body: JSON.stringify(envio),
      signal: AbortSignal.timeout(config.timeout_ms),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({
        ok: false,
        enviado: false,
        modo: config.modo_conexao,
        mensagem: `Gateway da maquininha respondeu erro HTTP ${response.status}.`,
        detalhe: text || null,
      });
    }

    return res.json({
      ok: true,
      enviado: true,
      modo: config.modo_conexao,
      mensagem: "Pedido enviado para a integracao da maquininha.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Falha de comunicacao com gateway";
    return res.status(502).json({
      ok: false,
      enviado: false,
      modo: config.modo_conexao,
      mensagem: msg,
    });
  }
});

router.post("/testar", async (_req, res) => {
  const config = await loadConfig();
  res.json({
    ok: true,
    ativo: config.ativo,
    modo_conexao: config.modo_conexao,
    mensagem:
      config.modo_conexao === "api"
        ? "Teste de configuracao pronto. Use o PDV para teste real com envio de valor."
        : "Modo sem API: o sistema prepara os dados e a confirmacao segue manual.",
  });
});

export default router;
