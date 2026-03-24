import { useMutation } from "@tanstack/react-query";

const BASE = "/api/impressora";

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Erro na requisição");
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
