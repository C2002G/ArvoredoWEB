import { useQueryClient } from "@tanstack/react-query";
import {
  useListarClientes,
  useResumoFiado,
  useExtratoCliente,
  useCriarCliente,
  useEditarCliente,
  usePagarFiado,
  getListarClientesQueryKey,
  getResumoFiadoQueryKey,
  getExtratoClienteQueryKey,
  getStatusCaixaQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import type { ListarClientesParams } from "@workspace/api-client-react/src/generated/api.schemas";

export function useFiadoClientes(params?: ListarClientesParams) {
  return useListarClientes(params);
}

export function useFiadoResumo() {
  return useResumoFiado();
}

export function useFiadoExtrato(clienteId: number | null) {
  return useExtratoCliente(clienteId as number, {
    query: {
      queryKey: getExtratoClienteQueryKey(clienteId as number),
      enabled: !!clienteId,
    },
  });
}

export function useCriarClienteWrapper() {
  const queryClient = useQueryClient();
  return useCriarCliente({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListarClientesQueryKey() });
      },
    },
  });
}

export function useEditarClienteWrapper() {
  const queryClient = useQueryClient();
  return useEditarCliente({
    mutation: {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries({ queryKey: getListarClientesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getResumoFiadoQueryKey() });
        queryClient.invalidateQueries({ queryKey: getExtratoClienteQueryKey(variables.id) });
      },
    },
  });
}

export function usePagarFiadoWrapper() {
  const queryClient = useQueryClient();
  return usePagarFiado({
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: getResumoFiadoQueryKey() });
        queryClient.invalidateQueries({ queryKey: getExtratoClienteQueryKey(variables.id) });
        queryClient.invalidateQueries({ queryKey: getStatusCaixaQueryKey() });
      },
    },
  });
}
