import { create } from "zustand";
import type { ItemVendaInput, Produto } from "@workspace/api-client-react/src/generated/api.schemas";

export interface CartItem {
  produto_id: number;
  nome_snap: string;
  /** Sempre: para feira = peso em kg; demais = quantidade da venda */
  quantidade: number;
  preco_unit: number;
  subtotal: number;
  is_cozinha: boolean;
  is_feira: boolean;
  unidade: string;
  /** Legado: mantido para compatibilidade de tipos, sem uso na feira. */
  unidades: number;
}

interface CartStore {
  items: CartItem[];
  desconto: number;
  addItem: (produto: Produto) => void;
  addWeightedItem: (produto: Produto, pesoKg: number) => void;
  removeItem: (produtoId: number) => void;
  updateQuantity: (produtoId: number, delta: number) => void;
  setFeiraPesoUnidades: (produtoId: number, next: { peso_kg: number }) => void;
  setDesconto: (val: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getSubtotal: () => number;
  getPayloadItens: () => ItemVendaInput[];
}

export const useCart = create<CartStore>((set, get) => ({
  items: [],
  desconto: 0,

  addItem: (produto) => {
    set((state) => {
      const existing = state.items.find((i) => i.produto_id === produto.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.produto_id === produto.id
              ? (() => {
                  const q = i.quantidade + 1;
                  return {
                    ...i,
                    quantidade: q,
                    unidades: i.is_feira ? i.unidades : q,
                    subtotal: q * i.preco_unit,
                  };
                })()
              : i,
          ),
        };
      }

      const nomeCompleto = produto.marca ? `${produto.nome} - ${produto.marca}` : produto.nome;
      return {
        items: [
          ...state.items,
          {
            produto_id: produto.id,
            nome_snap: nomeCompleto,
            quantidade: 1,
            preco_unit: produto.preco,
            subtotal: produto.preco,
            is_cozinha: produto.categoria === "cozinha",
            is_feira: produto.categoria === "feira",
            unidade: produto.unidade,
            unidades: 1,
          },
        ],
      };
    });
  },

  addWeightedItem: (produto, pesoKg) => {
    const peso = Number(pesoKg.toFixed(3));
    if (peso <= 0) return;

    set((state) => {
      const existing = state.items.find((i) => i.produto_id === produto.id);
      const nomeCompleto = produto.marca ? `${produto.nome} - ${produto.marca}` : produto.nome;
      if (existing) {
        const novaQtd = Number((existing.quantidade + peso).toFixed(3));
        return {
          items: state.items.map((i) =>
            i.produto_id === produto.id
              ? {
                  ...i,
                  quantidade: novaQtd,
                  unidades: i.unidades,
                  subtotal: Number((novaQtd * i.preco_unit).toFixed(2)),
                }
              : i,
          ),
        };
      }

      return {
        items: [
          ...state.items,
          {
            produto_id: produto.id,
            nome_snap: nomeCompleto,
            quantidade: peso,
            preco_unit: produto.preco,
            subtotal: Number((peso * produto.preco).toFixed(2)),
            is_cozinha: false,
            is_feira: true,
            unidade: produto.unidade,
            unidades: 0,
          },
        ],
      };
    });
  },

  removeItem: (produtoId) => {
    set((state) => ({
      items: state.items.filter((i) => i.produto_id !== produtoId),
    }));
  },

  updateQuantity: (produtoId, delta) => {
    set((state) => {
      return {
        items: state.items
          .map((i) => {
            if (i.produto_id !== produtoId) return i;
            if (i.is_feira) {
              const newQtd = Math.max(0, Number((i.quantidade + delta).toFixed(3)));
              return { ...i, quantidade: newQtd, subtotal: Number((newQtd * i.preco_unit).toFixed(2)) };
            }
            const newQtd = Math.max(0, i.quantidade + delta);
            return {
              ...i,
              quantidade: newQtd,
              unidades: newQtd,
              subtotal: newQtd * i.preco_unit,
            };
          })
          .filter((i) => i.quantidade > 0),
      };
    });
  },

  setFeiraPesoUnidades: (produtoId, next) => {
    const peso = Number(next.peso_kg.toFixed(3));
    if (peso <= 0) return;
    set((state) => ({
      items: state.items.map((i) =>
        i.produto_id === produtoId && i.is_feira
          ? {
              ...i,
              quantidade: peso,
              unidades: i.unidades,
              subtotal: Number((peso * i.preco_unit).toFixed(2)),
            }
          : i,
      ),
    }));
  },

  setDesconto: (val) => set({ desconto: val }),

  clearCart: () => set({ items: [], desconto: 0 }),

  getSubtotal: () => {
    const { items } = get();
    return items.reduce((acc, i) => acc + i.subtotal, 0);
  },

  getTotal: () => {
    const { getSubtotal, desconto } = get();
    return Math.max(0, getSubtotal() - desconto);
  },

  getPayloadItens: () => {
    const { items } = get();
    return items.map((i) => {
      const o: ItemVendaInput = {
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        preco_unit: i.preco_unit,
      };
      return o;
    });
  },
}));
