import { create } from "zustand";
import type { ItemVendaInput, Produto } from "@workspace/api-client-react/src/generated/api.schemas";

export interface CartItem {
  produto_id: number;
  nome_snap: string;
  quantidade: number;
  preco_unit: number;
  subtotal: number;
  is_cozinha: boolean;
}

interface CartStore {
  items: CartItem[];
  desconto: number;
  addItem: (produto: Produto) => void;
  removeItem: (produtoId: number) => void;
  updateQuantity: (produtoId: number, delta: number) => void;
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
              ? {
                  ...i,
                  quantidade: i.quantidade + 1,
                  subtotal: (i.quantidade + 1) * i.preco_unit,
                }
              : i
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
            if (i.produto_id === produtoId) {
              const newQtd = Math.max(0, i.quantidade + delta);
              return { ...i, quantidade: newQtd, subtotal: newQtd * i.preco_unit };
            }
            return i;
          })
          .filter((i) => i.quantidade > 0),
      };
    });
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
    return items.map((i) => ({
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      preco_unit: i.preco_unit,
    }));
  },
}));
