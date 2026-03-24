import { useQueryClient } from "@tanstack/react-query";
import {
  useListarMovimentos,
  useMovimentarEstoque,
  getListarMovimentosQueryKey,
  getListarProdutosQueryKey,
  getAlertasEstoqueQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import type { ListarMovimentosParams } from "@workspace/api-client-react/src/generated/api.schemas";

export function useEstoqueMovimentos(params?: ListarMovimentosParams) {
  return useListarMovimentos(params);
}

export function useMovimentarEstoqueWrapper() {
  const queryClient = useQueryClient();
  return useMovimentarEstoque({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListarMovimentosQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListarProdutosQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAlertasEstoqueQueryKey() });
      },
    },
  });
}
