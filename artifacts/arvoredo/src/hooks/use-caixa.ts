import { useQueryClient } from "@tanstack/react-query";
import {
  useStatusCaixa,
  useHistoricoCaixa,
  useListarSangrias,
  useAbrirCaixa,
  useFecharCaixa,
  useRegistrarSangria,
  getStatusCaixaQueryKey,
  getHistoricoCaixaQueryKey,
  getListarSangriasQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import type { ListarSangriasParams } from "@workspace/api-client-react/src/generated/api.schemas";

export function useCaixaStatus() {
  return useStatusCaixa();
}

export function useCaixaHistorico() {
  return useHistoricoCaixa();
}

export function useCaixaSangrias(params?: ListarSangriasParams) {
  return useListarSangrias(params, {
    query: {
      queryKey: getListarSangriasQueryKey(params),
      enabled: !!params?.sessao_id,
    },
  });
}

export function useAbrirCaixaWrapper() {
  const queryClient = useQueryClient();
  return useAbrirCaixa({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getStatusCaixaQueryKey() });
        queryClient.invalidateQueries({ queryKey: getHistoricoCaixaQueryKey() });
      },
    },
  });
}

export function useFecharCaixaWrapper() {
  const queryClient = useQueryClient();
  return useFecharCaixa({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getStatusCaixaQueryKey() });
        queryClient.invalidateQueries({ queryKey: getHistoricoCaixaQueryKey() });
      },
    },
  });
}

export function useRegistrarSangriaWrapper() {
  const queryClient = useQueryClient();
  return useRegistrarSangria({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getStatusCaixaQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListarSangriasQueryKey() });
      },
    },
  });
}
