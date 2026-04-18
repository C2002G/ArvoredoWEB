import { useMutation, useQuery } from "@tanstack/react-query";

const BASE = "/api/maquininha";

export type MaquininhaConfig = {
  ativo: boolean;
  modo_conexao: "manual" | "api" | "usb_bridge";
  api_url: string;
  api_token: string;
  timeout_ms: number;
  empresa_nome: string;
  empresa_cnpj: string;
  empresa_regra_padrao: string;
};

type EnvioMaquininhaInput = {
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.mensagem || "Erro na requisicao da maquininha");
  return payload as T;
}

export function useMaquininhaConfig() {
  return useQuery({
    queryKey: ["maquininha", "config"],
    queryFn: () => request<MaquininhaConfig>("/config"),
  });
}

export function useSalvarMaquininhaConfig() {
  return useMutation({
    mutationFn: (data: Partial<MaquininhaConfig>) =>
      request<{ ok: boolean; config: MaquininhaConfig }>("/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useEnviarParaMaquininha() {
  return useMutation({
    mutationFn: (data: EnvioMaquininhaInput) =>
      request<{ ok: boolean; enviado: boolean; mensagem: string; modo: string }>("/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useTestarMaquininha() {
  return useMutation({
    mutationFn: () =>
      request<{ ok: boolean; mensagem: string; modo_conexao: string }>("/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
  });
}
