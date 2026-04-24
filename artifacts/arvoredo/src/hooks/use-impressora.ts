import { useMutation } from "@tanstack/react-query";

const BASE = "/api/impressora";

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Erro na requisição (${res.status})`;
    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      try {
        const data = await res.json();
        message = data?.erro ?? data?.message ?? JSON.stringify(data) ?? message;
      } catch {
        // ignore parse error
      }
    } else {
      const text = await res.text();
      if (text) message = text;
    }

    throw new Error(message);
  }

  return res.json();
}

export function useImprimirCupom() {
  return useMutation({
    mutationFn: ({ data }: { data: { venda_id: number } }) => post("/cupom", data),
  });
}

export function useImprimirSangria() {
  return useMutation({
    mutationFn: ({ data }: { data: { data_inicio: string; data_fim: string; sessao_id?: number | null } }) =>
      post("/sangria", data),
  });
}

export function useTestarImpressora() {
  return useMutation({
    mutationFn: () => post("/teste", {}),
  });
}
