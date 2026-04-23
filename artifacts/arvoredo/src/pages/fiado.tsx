import React, { useState } from "react";
import { useFiadoResumo, useFiadoExtrato, useCriarClienteWrapper, usePagarFiadoWrapper } from "@/hooks/use-fiado";
import { useVendaItens } from "@/hooks/use-vendas";
import { formatMoney, formatDate } from "@/lib/utils";
import { Button, Input, Modal } from "@/components/ui-elements";
import { Search, UserPlus, CheckCircle2, ChevronRight, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Fiado() {
  const [search, setSearch] = useState("");
  const { data: resumo = [] } = useFiadoResumo();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: extrato, isLoading: loadingExtrato } = useFiadoExtrato(selectedId);
  
  const criarCliente = useCriarClienteWrapper();
  const pagarFiado = usePagarFiadoWrapper();
  const { toast } = useToast();

  const [vendaItensModalId, setVendaItensModalId] = useState<number | null>(null);
  const { data: itensVenda = [], isLoading: loadingItensVenda } = useVendaItens(vendaItensModalId);

  const [novoModal, setNovoModal] = useState(false);
  const [pagarModal, setPagarModal] = useState(false);
  const [valorPagamento, setValorPagamento] = useState("");
  const [novoCliente, setNovoCliente] = useState({ nome: "", apelido: "", telefone: "", cpf: "" });

  const filteredResumo = resumo.filter(r =>
    r.cliente.nome.toLowerCase().includes(search.toLowerCase()) ||
    (r.cliente.apelido || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.cliente.cpf || "").includes(search)
  );

  const handleCriarCliente = (e: React.FormEvent) => {
    e.preventDefault();
    criarCliente.mutate({
      data: {
        nome: novoCliente.nome,
        apelido: novoCliente.apelido || null,
        telefone: novoCliente.telefone || null,
        cpf: novoCliente.cpf || null,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Cliente criado", className: "bg-green-600 text-white" });
        setNovoModal(false);
        setNovoCliente({ nome: "", apelido: "", telefone: "", cpf: "" });
      }
    });
  };

  const handlePagar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    pagarFiado.mutate({ id: selectedId, data: { valor: Number(valorPagamento) } }, {
      onSuccess: () => {
        toast({ title: "Pagamento registrado com sucesso", className: "bg-green-600 text-white" });
        setPagarModal(false);
        setValorPagamento("");
      },
      onError: (err) => {
        toast({ title: "Erro", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Sidebar - Clientes */}
      <div className="w-full md:w-80 bg-card border-r border-border flex flex-col h-full flex-shrink-0">
        <div className="p-6 border-b border-border space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Comandas em Aberto</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Clientes com saldo devedor</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setNovoModal(true)}>
              <UserPlus className="w-5 h-5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar nome, apelido, CPF..." 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredResumo.map(r => (
            <button
              key={r.cliente.id}
              onClick={() => setSelectedId(r.cliente.id)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selectedId === r.cliente.id 
                  ? 'bg-primary border-primary text-primary-foreground shadow-md' 
                  : 'bg-background border-border hover:border-primary/50'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <div>
                  <span className="font-bold truncate pr-2 block">
                    {r.cliente.apelido || r.cliente.nome}
                  </span>
                  {r.cliente.apelido && (
                    <span className={`text-xs ${selectedId === r.cliente.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {r.cliente.nome}
                    </span>
                  )}
                </div>
                <ChevronRight className={`w-4 h-4 ${selectedId === r.cliente.id ? 'opacity-100' : 'opacity-0'}`} />
              </div>
              <div className={`font-mono font-bold ${
                selectedId === r.cliente.id ? 'text-primary-foreground/90' : 'text-destructive'
              }`}>
                {formatMoney(r.total_aberto)}
              </div>
            </button>
          ))}
          {filteredResumo.length === 0 && (
            <div className="text-center text-muted-foreground p-4">
              Nenhum cliente encontrado
            </div>
          )}
        </div>
      </div>

      {/* Main - Extrato */}
      <div className="flex-1 bg-background h-full overflow-y-auto p-6 md:p-8">
        {!selectedId ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
            <History className="w-16 h-16 mb-4" />
            <p className="text-xl">Selecione um cliente para ver o extrato</p>
          </div>
        ) : loadingExtrato ? (
          <div className="h-full flex items-center justify-center">Carregando...</div>
        ) : extrato ? (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-card p-8 rounded-2xl shadow-sm border border-border flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-1">{extrato.cliente.nome}</h1>
                {extrato.cliente.apelido && (
                  <p className="text-primary font-medium text-lg">"{extrato.cliente.apelido}"</p>
                )}
                <p className="text-muted-foreground text-sm mt-1">Cliente desde {formatDate(extrato.cliente.criado_em).split(' ')[0]}</p>
                {extrato.cliente.telefone && <p className="text-muted-foreground text-sm">{extrato.cliente.telefone}</p>}
                {extrato.cliente.cpf && <p className="text-muted-foreground text-sm">CPF: {extrato.cliente.cpf}</p>}
              </div>
              <div className="bg-destructive/10 border border-destructive/20 p-6 rounded-2xl text-center min-w-[200px]">
                <p className="text-sm font-semibold text-destructive uppercase tracking-wider mb-1">Total em Aberto</p>
                <p className="text-4xl font-black font-mono text-destructive">{formatMoney(extrato.total_aberto)}</p>
                <Button 
                  className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white" 
                  onClick={() => { setValorPagamento(extrato.total_aberto.toString()); setPagarModal(true); }}
                  disabled={extrato.total_aberto <= 0}
                >
                  Registrar Pagamento
                </Button>
              </div>
            </div>

            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-6 border-b border-border bg-secondary/20">
                <h3 className="font-bold text-lg">Histórico de Conta</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-muted/50 text-muted-foreground text-sm uppercase">
                    <tr>
                      <th className="px-6 py-4 font-medium">Data</th>
                      <th className="px-6 py-4 font-medium">Tipo</th>
                      <th className="px-6 py-4 font-medium text-right">Valor</th>
                      <th className="px-6 py-4 font-medium text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {extrato.fiados.map(f => {
                      const podeVerItens = f.venda_id != null;
                      return (
                      <tr
                        key={f.id}
                        onClick={() => podeVerItens && setVendaItensModalId(f.venda_id)}
                        className={`hover:bg-muted/30 ${podeVerItens ? "cursor-pointer" : ""}`}
                        title={podeVerItens ? "Clique para ver os produtos desta compra" : undefined}
                      >
                        <td className="px-6 py-4">{formatDate(f.criado_em)}</td>
                        <td className="px-6 py-4 font-medium">
                          {f.pago && f.venda_id === null ? 'Pagamento' : `Compra #${f.venda_id || ''}`}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold">
                          +{formatMoney(f.valor)}
                        </td>
                        <td className="px-6 py-4 flex justify-center">
                          {f.pago ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> PAGO
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-destructive/10 text-destructive text-xs font-bold rounded-full">ABERTO</span>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                    {extrato.fiados.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Modal isOpen={novoModal} onClose={() => setNovoModal(false)} title="Novo Cliente">
        <form onSubmit={handleCriarCliente} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nome Completo *</label>
              <Input required value={novoCliente.nome} onChange={e => setNovoCliente({...novoCliente, nome: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Apelido (opcional)</label>
              <Input
                value={novoCliente.apelido}
                onChange={e => setNovoCliente({...novoCliente, apelido: e.target.value})}
                placeholder="Ex: Seu João"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Telefone (opcional)</label>
              <Input
                value={novoCliente.telefone}
                onChange={e => setNovoCliente({...novoCliente, telefone: e.target.value})}
                placeholder="(51) 99999-9999"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">CPF (opcional)</label>
              <Input
                value={novoCliente.cpf}
                onChange={e => setNovoCliente({...novoCliente, cpf: e.target.value})}
                placeholder="000.000.000-00"
              />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setNovoModal(false)}>Cancelar</Button>
            <Button type="submit" disabled={criarCliente.isPending}>Salvar</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={vendaItensModalId != null}
        onClose={() => setVendaItensModalId(null)}
        title={`Produtos da compra #${vendaItensModalId ?? ""}`}
      >
        {loadingItensVenda ? (
          <div className="py-8 text-center text-muted-foreground">Carregando itens...</div>
        ) : itensVenda.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">Nenhum item encontrado para esta venda.</div>
        ) : (
          <div className="space-y-4">
            {itensVenda.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center p-4 bg-secondary/30 rounded-xl border border-border"
              >
                <div>
                  <p className="font-bold text-foreground">{item.nome_snap}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.quantidade}x {formatMoney(item.preco_unit)}
                  </p>
                </div>
                <div className="font-mono font-bold text-lg">{formatMoney(item.subtotal)}</div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal isOpen={pagarModal} onClose={() => setPagarModal(false)} title="Registrar Pagamento">
        <form onSubmit={handlePagar} className="space-y-4">
          <p className="text-muted-foreground mb-4">
            Registre o valor pago pelo cliente. O valor será abatido das compras mais antigas.
          </p>
          <div>
            <label className="block text-sm font-medium mb-1">Valor do Pagamento (R$) *</label>
            <Input 
              required 
              type="number" 
              step="0.01" 
              min="0.01"
              value={valorPagamento} 
              onChange={e => setValorPagamento(e.target.value)} 
              className="text-2xl h-14 font-mono font-bold"
            />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setPagarModal(false)}>Cancelar</Button>
            <Button type="submit" disabled={pagarFiado.isPending} className="bg-green-600 hover:bg-green-700">
              {pagarFiado.isPending ? "Processando..." : "Confirmar Pagamento"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
