import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Operador {
  id: number;
  nome: string;
  sobrenome?: string | null;
  cor: string;
  iniciais: string;
}

interface OperadorState {
  operador: Operador | null;
  setOperador: (op: Operador | null) => void;
}

export const useOperador = create<OperadorState>()(
  persist(
    (set) => ({
      operador: null,
      setOperador: (operador) => set({ operador }),
    }),
    { name: "arvoredo-operador" },
  ),
);