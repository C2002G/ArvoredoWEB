import { useQueryClient } from "@tanstack/react-query";
import {
  useListarVendas,
  useResumoHoje,
  useItensDaVenda,
  useRegistrarVenda,
  getListarVendasQueryKey,
  getResumoHojeQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import type { ListarVendasParams } from "@workspace/api-client-react/src/generated/api.schemas";
import { getListarProdutosQueryKey, getAlertasEstoqueQueryKey } from "@workspace/api-client-react/src/generated/api";
import { getStatusCaixaQueryKey } from "@workspace/api-client-react/src/generated/api";

export function useVendasList(params?: ListarVendasParams) {
  return useListarVendas(params);
}

export function useVendasResumoHoje() {
  return useResumoHoje();
}

export function useVendaItens(vendaId: number | null) {
  return useItensDaVenda(vendaId as number, { query: { enabled: !!vendaId } });
}

export function useRegistrarVendaWrapper() {
  const queryClient = useQueryClient();
  return useRegistrarVenda({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListarVendasQueryKey() });
        queryClient.invalidateQueries({ queryKey: getResumoHojeQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListarProdutosQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAlertasEstoqueQueryKey() });
        queryClient.invalidateQueries({ queryKey: getStatusCaixaQueryKey() });
      },
    },
  });
}
