import { Router, type IRouter } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";

type ModoConexao = "manual" | "api" | "usb_bridge" | "controlpay";

type MaquininhaConfig = {
  ativo: boolean;
  modo_conexao: ModoConexao;
  api_url: string;
  api_token: string;
  timeout_ms: number;
  empresa_nome: string;
  empresa_cnpj: string;
  empresa_regra_padrao: string;
  cnpj_credenciadora: string;
};

const router: IRouter = Router();

const CONFIG_PATH = path.resolve(process.cwd(), "data", "maquininha-config.json");
const DEFAULT_CONFIG: MaquininhaConfig = {
  ativo: true,
  modo_conexao: "manual",
  api_url: "",
  api_token: "",
  timeout_ms: 60000,
  empresa_nome: "NOME DA EMPRESA",
  empresa_cnpj: "00.000.000/0000-00",
  empresa_regra_padrao: "Venda presencial. Confirmar manualmente no PDV apos aprovacao na maquininha.",
  cnpj_credenciadora: "",
};

async function loadConfig(): Promise<MaquininhaConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<MaquininhaConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(config: MaquininhaConfig): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

const FORMA_PAGAMENTO: Record<string, number> = {
  credito: 21,
  debito: 22,
  pix: 25,
};

const STATUS_APROVADO = 10;
const STATUS_NEGADOS = [15, 20, 25];

async function pollingIntencao(
  baseUrl: string,
  key: string,
  intencaoVendaId: number,
  timeoutMs: number,
): Promise<{ aprovado: boolean; data: any; timeout?: boolean }> {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const resp = await fetch(`${baseUrl}/webapi/IntencaoVenda/GetById/?key=${key}&intencaoVendaId=${intencaoVendaId}`, {
        headers: { "User-Agent": "ArvoredoPDV/1.0" },
      });
      if (!resp.ok) continue;
      const data = (await resp.json()) as any;
      const status: number =
        data?.intencaoVenda?.intencaoVendaStatus?.id ??
        data?.statusId ??
        data?.status?.id;
      const statusNome = data?.intencaoVenda?.intencaoVendaStatus?.nome;
      console.log(`[TEF] poll ${intencaoVendaId}: status=${status} (${statusNome})`);
      if (status === STATUS_APROVADO) return { aprovado: true, data };
      if (STATUS_NEGADOS.includes(status)) return { aprovado: false, data };
    } catch (e) {
      console.log(`[TEF] poll ${intencaoVendaId}: erro de rede, seguindo...`, e);
    }
  }
  return { aprovado: false, data: null, timeout: true };
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
    timeout_ms: Math.max(1500, Number(body.timeout_ms ?? current.timeout_ms ?? 60000)),
  };
  await saveConfig(merged);
  res.json({ ok: true, config: merged });
});

router.post("/enviar", async (req, res) => {
  const config = await loadConfig();

  const payload = req.body as {
    venda_local_id?: string;
    metodo: "debito" | "credito" | "pix";
    valor_total: number; // em reais, ex: 10.50
    parcelas?: number; // opcional, apenas para crédito
  };

  if (!config.ativo) {
    return res.json({ ok: false, mensagem: "Maquininha desativada nas configurações." });
  }

  const baseUrl = process.env.CONTROLPAY_BASE_URL?.trim() || "https://sandbox.controlpay.com.br";
  const key = process.env.CONTROLPAY_KEY?.trim() || "";
  const terminalId = Number(process.env.CONTROLPAY_TERMINAL_ID) || 0; 
  // tempo para maquina reconhecer a transação e o cliente interagir com a maquininha (em ms) 
  const timeoutMs = Number(process.env.CONTROLPAY_TIMEOUT_MS) || 600000;
  

  if (!key) {
    return res.status(500).json({ ok: false, mensagem: "CONTROLPAY_KEY não configurada no .env" });
  }

  const formaPagamentoId = FORMA_PAGAMENTO[payload.metodo];
  if (!formaPagamentoId) {
    return res.status(400).json({ ok: false, mensagem: "Método de pagamento inválido." });
  }

  const valorStr = payload.valor_total.toFixed(2).replace(".", ",");

  const quantidadeParcelas = payload.parcelas && payload.parcelas > 1 ? payload.parcelas : 1;
  const tipoParcelamentoId = quantidadeParcelas > 1 ? 3 : 1; // 3 = Parcelado Estabelecimento (Loja)

  let intencaoVendaId: number;
  try {
    const criarResp = await fetch(
      `${baseUrl}/webapi/Venda/Vender/?key=${key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ArvoredoPDV/1.0",
        },
        body: JSON.stringify({
          aguardarTefIniciarTransacao: true,
          formaPagamentoId,
          valorTotalVendido: valorStr,
          terminalId,
          quantidadeParcelas,
          tipoParcelamentoId,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!criarResp.ok) {
      const txt = await criarResp.text();
      return res.status(502).json({ ok: false, mensagem: `ControlPay recusou: ${txt}` });
    }
    const criarData = (await criarResp.json()) as any;
    intencaoVendaId = criarData?.intencaoVenda?.id ?? criarData?.intencaoVendaId ?? criarData?.id;
    if (!intencaoVendaId) throw new Error("intencaoVendaId não retornado pelo ControlPay");
    console.log("\n=======================================================");
    console.log(`🧾 ID PARA A PLANILHA DA PAYGO: ${intencaoVendaId}`);
    console.log("=======================================================\n");
  } catch (err: any) {
    return res.status(502).json({ ok: false, mensagem: err.message });
  }

  const resultado = await pollingIntencao(baseUrl, key, intencaoVendaId, timeoutMs);

  if (!resultado.aprovado) {
  const statusId = resultado.data?.intencaoVenda?.intencaoVendaStatus?.id;
  const motivo = resultado.timeout
    ? "Timeout — cliente não interagiu com a maquininha no tempo limite."
    : statusId === 20
      ? "Operação Cancelada"
      : statusId === 25
        ? "Transação negada pelo host."
        : `Transação negada ou cancelada. Status: ${statusId ?? "desconhecido"}`;
  return res.status(402).json({ ok: false, mensagem: motivo });
  }

  const pagamento =
    resultado.data?.intencaoVenda?.pagamentosExternos?.[0] ??
    resultado.data?.pagamentosExternos?.[0] ??
    resultado.data?.pagamentoExterno ??
    {};

  const codigoAutorizacao =
    pagamento?.codigoAutorizacao ??
    pagamento?.codigo_autorizacao ??
    pagamento?.autorizacao ??
    pagamento?.authorizationCode ??
    pagamento?.codigo ??
    null;
  const bandeiraCartao =
    pagamento?.bandeiraCartao ??
    pagamento?.bandeira_cartao ??
    pagamento?.bandeira ??
    pagamento?.nomeBandeira ??
    null;
  const tipoPagamento =
    payload.metodo === "credito" ? "03" : payload.metodo === "debito" ? "04" : "17";

  return res.json({
    ok: true,
    aprovado: true,
    dados_cartao: {
      cnpj_credenciadora: config.cnpj_credenciadora || null,
      codigo_autorizacao: codigoAutorizacao,
      bandeira_cartao: bandeiraCartao,
      tipo_pagamento: tipoPagamento,
      nsu_tef: pagamento?.nsuTid ?? pagamento?.nsu ?? null,
      tef_intencao_id: intencaoVendaId,
    },
    comprovante_estabelecimento: pagamento.comprovanteEstabelecimento ?? null,
    comprovante_cliente: pagamento.comprovanteCliente ?? null,
  });
});

router.post("/cancelar", async (req, res) => {
  const { intencao_venda_id } = req.body as { intencao_venda_id: number };

  const baseUrl = process.env.CONTROLPAY_BASE_URL?.trim() || "https://sandbox.controlpay.com.br";
  const key = process.env.CONTROLPAY_KEY?.trim() || "";

  try {
    const resp = await fetch(
      `${baseUrl}/webapi/Venda/CancelarVenda/?key=${key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ArvoredoPDV/1.0",
        },
        body: JSON.stringify({
          intencaoVendaId: intencao_venda_id,
          aguardarTefIniciarTransacao: true,
          senhaTecnica: "314159",
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = (await resp.json()) as any;
    return res.json({ ok: true, mensagem: "Cancelamento enviado ao ControlPay.", data });
  } catch (err: any) {
    return res.status(502).json({ ok: false, mensagem: err.message });
  }
});

router.post("/testar", async (_req, res) => {
  const config = await loadConfig();
  const baseUrl = process.env.CONTROLPAY_BASE_URL?.trim() || "https://sandbox.controlpay.com.br";
  const key = process.env.CONTROLPAY_KEY?.trim() || "";

  let paygoOnline = false;
  try {
    const resp = await fetch(
      `${baseUrl}/webapi/Instalacao/GetById/?key=${key}`,
      { signal: AbortSignal.timeout(5000) },
    );
    paygoOnline = resp.ok;
  } catch {
    paygoOnline = false;
  }

  return res.json({
    ok: true,
    ativo: config.ativo,
    modo_conexao: config.modo_conexao,
    paygo_online: paygoOnline,
    mensagem: paygoOnline
      ? "PayGo Windows respondendo. Use o PDV para teste real com cartão."
      : "PayGo Windows offline. Verifique se está instalado e rodando no computador.",
  });
});

export default router;
