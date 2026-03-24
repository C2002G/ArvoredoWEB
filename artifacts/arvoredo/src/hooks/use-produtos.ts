import { useQueryClient } from "@tanstack/react-query";
import {
  useListarProdutos,
  useBuscarProduto,
  useAlertasEstoque,
  useCriarProduto,
  useEditarProduto,
  useDeletarProduto,
  getListarProdutosQueryKey,
  getAlertasEstoqueQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import type { BuscarProdutoParams, ListarProdutosParams } from "@workspace/api-client-react/src/generated/api.schemas";

export function useProdutos(params?: ListarProdutosParams) {
  return useListarProdutos(params);
}

export function useProdutosBusca(params: BuscarProdutoParams) {
  return useBuscarProduto(params, { query: { enabled: !!params.q || !!params.codigo || !!params.nome } });
}

export function useProdutosAlertas() {
  return useAlertasEstoque();
}

export function useCriarProdutoWrapper() {
  const queryClient = useQueryClient();
  return useCriarProduto({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListarProdutosQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAlertasEstoqueQueryKey() });
      },
    },
  });
}

export function useEditarProdutoWrapper() {
  const queryClient = useQueryClient();
  return useEditarProduto({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListarProdutosQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAlertasEstoqueQueryKey() });
      },
    },
  });
}

export function useDeletarProdutoWrapper() {
  const queryClient = useQueryClient();
  return useDeletarProduto({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListarProdutosQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAlertasEstoqueQueryKey() });
      },
    },
  });
}
