import React, { useState, useDeferredValue, useRef, useCallback } from "react";
import { useCart } from "@/store/use-cart";
import { useProdutos } from "@/hooks/use-produtos";
import { useRegistrarVendaWrapper } from "@/hooks/use-vendas";
import { useCaixaStatus } from "@/hooks/use-caixa";
import { useFiadoClientes } from "@/hooks/use-fiado";
import { useImprimirCupom } from "@/hooks/use-impressora";
import { formatMoney } from "@/lib/utils";
import { Search, ShoppingBag, Plus, Minus, Trash2, CreditCard, Banknote, QrCode, Users, Package, Printer, UserCheck, X } from "lucide-react";
import { Button, Input, Select, Modal } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import type { Produto } from "@workspace/api-client-react/src/generated/api.schemas";

type Cliente = { id: number; nome: string; apelido?: string | null; cpf?: string | null };

/* Pré-visualização do cupom quando impressora não está conectada */
function TicketPreview({ texto, onClose }: { texto: string; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Impressora não encontrada. Cupom gerado:</p>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-96 overflow-y-auto">
        <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">{texto}</pre>
      </div>
      <Button className="w-full" onClick={onClose}>Fechar</Button>
    </div>
  );
}

/* Modal de seleção de cliente para nota fiscal */
function ClienteSelectorModal({
  isOpen,
  onClose,
  clientes,
  onSelect,
  selected,
}: {
  isOpen: boolean;
  onClose: () => void;
  clientes: Cliente[];
  onSelect: (c: Cliente | null) => void;
  selected: Cliente | null;
}) {
  const [busca, setBusca] = useState("");
  const filtrados = clientes.filter(c => {
    const q = busca.toLowerCase();
    return (
      c.nome.toLowerCase().includes(q) ||
      (c.apelido || "").toLowerCase().includes(q) ||
      (c.cpf || "").includes(q)
    );
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Vincular cliente à nota fiscal">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Selecione um cliente para incluir nome e CPF no cupom fiscal. Opcional para qualquer forma de pagamento.
        </p>
        <Input
          autoFocus
          placeholder="Buscar por nome, apelido ou CPF..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <div className="max-h-64 overflow-y-auto space-y-1 rounded-xl border border-border">
          {/* Opção "sem cliente" */}
          <button
            onClick={() => { onSelect(null); onClose(); }}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-secondary transition-colors ${!selected ? 'bg-secondary font-semibold' : ''}`}
          >
            <X className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Sem cliente vinculado</span>
          </button>

          {filtrados.length === 0 && busca && (
            <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          )}

          {filtrados.map(c => (
            <button
              key={c.id}
              onClick={() => { onSelect(c); onClose(); }}
              className={`w-full text-left px-4 py-3 hover:bg-secondary transition-colors flex flex-col ${selected?.id === c.id ? 'bg-primary/10' : ''}`}
            >
              <span className="font-semibold">
                {c.apelido ? `${c.apelido}` : c.nome}
                {c.apelido && <span className="text-muted-foreground font-normal"> ({c.nome})</span>}
              </span>
              {c.cpf && (
                <span className="text-xs text-muted-foreground font-mono mt-0.5">CPF: {c.cpf}</span>
              )}
            </button>
          ))}
        </div>

        <Button variant="ghost" className="w-full" onClick={onClose}>Cancelar</Button>
      </div>
    </Modal>
  );
}

export default function Pdv() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [categoria, setCategoria] = useState<"mercado" | "cozinha" | "">("");
  
  const { data: produtos = [], isLoading } = useProdutos({ q: deferredSearch, categoria: categoria || undefined });
  const { data: statusCaixa } = useCaixaStatus();
  
  const cart = useCart();
  const registrarVenda = useRegistrarVendaWrapper();
  const imprimirCupom = useImprimirCupom();
  const { toast } = useToast();
  const { data: clientes = [] } = useFiadoClientes();

  const [checkoutModal, setCheckoutModal] = useState<{
    isOpen: boolean;
    paymentMethod: 'dinheiro' | 'pix' | 'cartao' | 'fiado' | null;
  }>({ isOpen: false, paymentMethod: null });

  const [cupomModal, setCupomModal] = useState<{ isOpen: boolean; texto: string | null }>({
    isOpen: false, texto: null,
  });

  const [clienteModal, setClienteModal] = useState(false);
  const [clienteNota, setClienteNota] = useState<Cliente | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<string>("");

  const handleAddToCart = (p: Produto) => {
    cart.addItem(p);
  };

  const handleCheckoutClick = (method: 'dinheiro' | 'pix' | 'cartao' | 'fiado') => {
    if (!statusCaixa?.aberto) {
      toast({ title: "Caixa Fechado", description: "Abra o caixa antes de registrar uma venda.", variant: "destructive" });
      return;
    }
    if (cart.items.length === 0) {
      toast({ title: "Carrinho Vazio", description: "Adicione produtos antes de finalizar.", variant: "destructive" });
      return;
    }
    if (method === 'fiado') {
      setCheckoutModal({ isOpen: true, paymentMethod: method });
    } else {
      processVenda(method, clienteNota?.id);
    }
  };

  const imprimirAposVenda = useCallback((vendaId: number) => {
    imprimirCupom.mutate({ data: { venda_id: vendaId } }, {
      onSuccess: (res: any) => {
        if (res?.simulado && res?.texto) {
          setCupomModal({ isOpen: true, texto: res.texto });
        } else if (!res?.ok) {
          toast({
            title: "Aviso de Impressão",
            description: res?.erro || "Não foi possível imprimir o cupom.",
            variant: "destructive",
          });
        }
      },
    });
  }, [imprimirCupom, toast]);

  const processVenda = (method: 'dinheiro' | 'pix' | 'cartao' | 'fiado', clienteId?: number) => {
    const hasCozinha = cart.items.some(i => i.is_cozinha);
    const hasMercado = cart.items.some(i => !i.is_cozinha);
    const saleCategory = hasCozinha && !hasMercado ? 'cozinha' : 'mercado';

    registrarVenda.mutate({
      data: {
        categoria: saleCategory,
        pagamento: method,
        desconto: cart.desconto,
        cliente_id: clienteId,
        itens: cart.getPayloadItens(),
      }
    }, {
      onSuccess: (venda) => {
        toast({ title: "✓ Venda Finalizada", description: "Imprimindo cupom...", className: "bg-green-600 text-white" });
        cart.clearCart();
        setClienteNota(null);
        setCheckoutModal({ isOpen: false, paymentMethod: null });
        if (venda?.id) imprimirAposVenda(venda.id);
      },
      onError: (err) => {
        toast({ title: "Erro na Venda", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left Area - Products */}
      <div className="flex-1 flex flex-col h-full bg-secondary/30 p-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
            <Input 
              autoFocus
              placeholder="Buscar por nome ou código de barras..." 
              className="pl-10 h-12 text-lg shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 p-1 bg-muted rounded-xl">
            <button
              onClick={() => setCategoria("")}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${categoria === "" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              Todos
            </button>
            <button
              onClick={() => setCategoria("mercado")}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${categoria === "mercado" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Mercado
            </button>
            <button
              onClick={() => setCategoria("cozinha")}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${categoria === "cozinha" ? "bg-kitchen text-kitchen-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Cozinha
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 pb-24 lg:pb-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando produtos...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {produtos.map((p) => (
                <div 
                  key={p.id}
                  onClick={() => handleAddToCart(p)}
                  className="bg-card p-4 rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-primary/50 cursor-pointer transition-all hover:-translate-y-1 flex flex-col h-32 select-none"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      {p.estoque} {p.unidade}
                    </span>
                    {p.categoria === 'cozinha' ? (
                      <span className="w-2 h-2 rounded-full bg-kitchen"></span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-primary"></span>
                    )}
                  </div>
                  <h3 className="font-bold text-foreground leading-tight line-clamp-2">
                    {p.nome} {p.marca ? `- ${p.marca}` : ''}
                  </h3>
                  <div className="mt-auto font-mono font-bold text-primary text-lg">
                    {formatMoney(p.preco)}
                  </div>
                </div>
              ))}
              {produtos.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Package className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg">Nenhum produto encontrado</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Area - Cart */}
      <div className="w-full lg:w-[400px] xl:w-[450px] bg-card border-l border-border flex flex-col flex-shrink-0 h-full">
        <div className="p-6 border-b border-border bg-secondary/10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="text-primary" />
              Carrinho
            </h2>
            <button
              onClick={() => setClienteModal(true)}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-all ${
                clienteNota
                  ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
              title="Vincular cliente à nota fiscal"
            >
              <UserCheck className="w-4 h-4" />
              {clienteNota ? (clienteNota.apelido || clienteNota.nome) : "Vincular cliente"}
            </button>
          </div>

          {/* Info do cliente vinculado */}
          {clienteNota && (
            <div className="mt-3 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-primary">
                  {clienteNota.apelido ? `${clienteNota.apelido} (${clienteNota.nome})` : clienteNota.nome}
                </p>
                {clienteNota.cpf && (
                  <p className="text-xs text-muted-foreground font-mono">CPF: {clienteNota.cpf}</p>
                )}
              </div>
              <button
                onClick={() => setClienteNota(null)}
                className="text-muted-foreground hover:text-destructive p-1"
                title="Remover cliente"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
              <ShoppingBag className="w-16 h-16 mb-4" />
              <p>O carrinho está vazio</p>
            </div>
          ) : (
            cart.items.map((item) => (
              <div key={item.produto_id} className="flex flex-col bg-secondary/30 p-3 rounded-xl border border-border/50">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold">{item.nome_snap}</span>
                  <button onClick={() => cart.removeItem(item.produto_id)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3 bg-background border border-border rounded-lg p-1">
                    <button onClick={() => cart.updateQuantity(item.produto_id, -1)} className="p-1 hover:bg-secondary rounded">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-mono font-bold w-6 text-center">{item.quantidade}</span>
                    <button onClick={() => cart.updateQuantity(item.produto_id, 1)} className="p-1 hover:bg-secondary rounded">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-primary">
                    {formatMoney(item.subtotal)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 bg-card border-t border-border shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono font-medium">{formatMoney(cart.getSubtotal())}</span>
          </div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-muted-foreground">Desconto (R$)</span>
            <Input 
              type="number" 
              min="0"
              step="0.01"
              value={cart.desconto || ''} 
              onChange={(e) => cart.setDesconto(Number(e.target.value))}
              className="w-24 h-8 text-right font-mono" 
            />
          </div>
          <div className="flex justify-between items-end mb-6">
            <span className="text-xl font-bold">Total</span>
            <span className="text-4xl font-black font-mono text-primary tracking-tight">
              {formatMoney(cart.getTotal())}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" variant="default" className="w-full flex-col h-auto py-3 gap-1" onClick={() => handleCheckoutClick('dinheiro')}>
              <Banknote className="w-6 h-6" />
              <span>Dinheiro</span>
            </Button>
            <Button size="lg" variant="outline" className="w-full flex-col h-auto py-3 gap-1 border-primary/20 hover:border-primary/50 text-primary" onClick={() => handleCheckoutClick('pix')}>
              <QrCode className="w-6 h-6" />
              <span>PIX</span>
            </Button>
            <Button size="lg" variant="outline" className="w-full flex-col h-auto py-3 gap-1 border-primary/20 hover:border-primary/50 text-primary" onClick={() => handleCheckoutClick('cartao')}>
              <CreditCard className="w-6 h-6" />
              <span>Cartão</span>
            </Button>
            <Button size="lg" variant="outline" className="w-full flex-col h-auto py-3 gap-1 border-destructive/20 hover:border-destructive hover:bg-destructive text-destructive hover:text-white" onClick={() => handleCheckoutClick('fiado')}>
              <Users className="w-6 h-6" />
              <span>Comanda</span>
            </Button>
          </div>

          {imprimirCupom.isPending && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Printer className="w-4 h-4 animate-pulse" />
              Imprimindo cupom...
            </div>
          )}
        </div>
      </div>

      {/* Modal Vincular Cliente */}
      <ClienteSelectorModal
        isOpen={clienteModal}
        onClose={() => setClienteModal(false)}
        clientes={clientes as Cliente[]}
        onSelect={setClienteNota}
        selected={clienteNota}
      />

      {/* Modal Fiado */}
      <Modal isOpen={checkoutModal.isOpen} onClose={() => setCheckoutModal({ isOpen: false, paymentMethod: null })} title="Finalizar Venda - Comanda em Aberto">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Selecione o Cliente</label>
            <Select value={selectedCliente} onChange={(e) => setSelectedCliente(e.target.value)}>
              <option value="">-- Selecione --</option>
              {clientes.map((c: any) => (
                <option key={c.id} value={c.id}>{c.apelido ? `${c.apelido} (${c.nome})` : c.nome}</option>
              ))}
            </Select>
          </div>
          <div className="bg-secondary p-4 rounded-xl flex justify-between items-center">
            <span className="font-semibold">Valor Total:</span>
            <span className="text-2xl font-bold text-destructive font-mono">{formatMoney(cart.getTotal())}</span>
          </div>
          <Button 
            className="w-full mt-4" 
            size="lg" 
            disabled={!selectedCliente || registrarVenda.isPending}
            onClick={() => processVenda('fiado', Number(selectedCliente))}
          >
            {registrarVenda.isPending ? "Registrando..." : "Confirmar na Comanda"}
          </Button>
        </div>
      </Modal>

      {/* Modal Cupom (impressora não conectada) */}
      <Modal
        isOpen={cupomModal.isOpen}
        onClose={() => setCupomModal({ isOpen: false, texto: null })}
        title="Cupom Fiscal"
      >
        {cupomModal.texto && (
          <TicketPreview
            texto={cupomModal.texto}
            onClose={() => setCupomModal({ isOpen: false, texto: null })}
          />
        )}
      </Modal>
    </div>
  );
}
