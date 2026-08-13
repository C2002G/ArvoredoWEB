import { useEffect, useState } from "react";
import { Button, Input, Modal, Select } from "@/components/ui-elements";
import { formatMoney, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { UserCog, Trash2, ArrowLeftRight } from "lucide-react";

type UsuarioResumo = {
  id: number;
  nome: string;
  sobrenome?: string | null;
  usuario: string;
  cor: string;
  ativo: boolean;
  iniciais: string;
  total_vendido: number;
  qtd_vendas: number;
};

type VendaDoUsuario = {
  id: number;
  categoria: string;
  pagamento: string;
  total: number;
  cliente_nome?: string | null;
  criado_em: string;
};

type ItemVenda = {
  id: number;
  nome_snap: string;
  quantidade: number;
  unidades?: number | null;
  preco_unit: number;
  subtotal: number;
};

export default function Usuarios() {
  const { toast } = useToast();
  const [usuarios, setUsuarios] = useState<UsuarioResumo[]>([]);
  const [loading, setLoading] = useState(true);

  const [selecionado, setSelecionado] = useState<UsuarioResumo | null>(null);
  const [vendas, setVendas] = useState<VendaDoUsuario[]>([]);
  const [loadingVendas, setLoadingVendas] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("10");
  const pageLimit = pageSize === "all" ? 1000 : Number(pageSize);

  const [vendaItens, setVendaItens] = useState<{ vendaId: number; itens: ItemVenda[] } | null>(null);
  const [transferirVendaId, setTransferirVendaId] = useState<number | null>(null);
  const [novoOperadorId, setNovoOperadorId] = useState<string>("");

  const carregarUsuarios = async () => {
    setLoading(true);
    const resp = await fetch("/api/usuarios/resumo");
    const data = await resp.json();
    setUsuarios(data);
    setLoading(false);
  };

  useEffect(() => {
    carregarUsuarios();
  }, []);

  const abrirUsuario = async (u: UsuarioResumo) => {
    setSelecionado(u);
    setPage(1);
  };

  useEffect(() => {
    if (!selecionado) return;
    setLoadingVendas(true);
    const params = new URLSearchParams({
      operador_id: String(selecionado.id),
      page: String(page),
      limit: String(pageLimit === 1000 ? pageLimit : pageLimit + 1),
    });
    fetch(`/api/vendas?${params}`)
      .then((r) => r.json())
      .then((data) => setVendas(data))
      .finally(() => setLoadingVendas(false));
  }, [selecionado, page, pageSize]);

  const vendasFiltradas = vendas.slice(0, pageLimit);
  const hasNextPage = vendas.length > pageLimit;

  const verItens = async (vendaId: number) => {
    const resp = await fetch(`/api/vendas/${vendaId}/itens`);
    const itens = await resp.json();
    setVendaItens({ vendaId, itens });
  };

  const confirmarTransferencia = async () => {
    if (!transferirVendaId || !novoOperadorId) return;
    const resp = await fetch(`/api/vendas/${transferirVendaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operador_id: Number(novoOperadorId) }),
    });
    if (resp.ok) {
      toast({ title: "Venda transferida", className: "bg-green-600 text-white" });
      setTransferirVendaId(null);
      setNovoOperadorId("");
      // recarrega a lista do usuario atual e os totais
      if (selecionado) {
        const params = new URLSearchParams({ operador_id: String(selecionado.id), page: String(page), limit: String(pageLimit) });
        const r = await fetch(`/api/vendas?${params}`);
        setVendas(await r.json());
      }
      carregarUsuarios();
    } else {
      toast({ title: "Erro ao transferir venda", variant: "destructive" });
    }
  };

  const excluirUsuario = async (u: UsuarioResumo) => {
    if (!confirm(`Inativar o operador "${u.nome}"? Ele não vai mais aparecer pra login, mas o histórico de vendas dele é mantido.`)) return;
    const resp = await fetch(`/api/usuarios/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: false }),
    });
    if (resp.ok) {
      toast({ title: "Operador inativado", className: "bg-green-600 text-white" });
      carregarUsuarios();
      if (selecionado?.id === u.id) setSelecionado(null);
    } else {
      toast({ title: "Erro ao inativar operador", variant: "destructive" });
    }
  };

  if (selecionado) {
    return (
      <div className="p-6 md:p-8 h-full overflow-y-auto max-w-7xl mx-auto">
        <button onClick={() => setSelecionado(null)} className="text-sm text-primary hover:underline mb-4">
          ← Voltar pra lista de usuários
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: selecionado.cor }}
          >
            {selecionado.iniciais}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{selecionado.nome} {selecionado.sobrenome ?? ""}</h1>
            <p className="text-muted-foreground text-sm">
              {selecionado.qtd_vendas} vendas · {formatMoney(selecionado.total_vendido)} em total vendido
            </p>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border bg-background flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Itens por página:</span>
              <Select value={pageSize} onChange={(e) => { setPageSize(e.target.value); setPage(1); }} className="w-28">
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="100">100</option>
                <option value="all">Todos</option>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1 || loadingVendas} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
              <span className="text-muted-foreground">Página {page}</span>
              <Button size="sm" variant="outline" disabled={loadingVendas || !hasNextPage} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>

          <table className="w-full text-left">
            <thead className="bg-muted/50 text-muted-foreground text-sm uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Data/Hora</th>
                <th className="px-6 py-4 font-medium">Categoria</th>
                <th className="px-6 py-4 font-medium">Pagamento</th>
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium text-right">Total</th>
                <th className="px-6 py-4 font-medium text-center">Opções</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingVendas ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
              ) : vendasFiltradas.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma venda encontrada.</td></tr>
              ) : (
                vendasFiltradas.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4">{formatDate(v.criado_em)}</td>
                    <td className="px-6 py-4 capitalize">{v.categoria}</td>
                    <td className="px-6 py-4 capitalize">{v.pagamento}</td>
                    <td className="px-6 py-4 text-muted-foreground">{v.cliente_nome || "-"}</td>
                    <td className="px-6 py-4 text-right font-mono font-bold">{formatMoney(v.total)}</td>
                    <td className="px-6 py-4 text-center flex items-center justify-center gap-3">
                      <button onClick={() => verItens(v.id)} className="text-primary hover:underline text-sm">Ver itens</button>
                      <button onClick={() => setTransferirVendaId(v.id)} title="Transferir pra outro usuário" className="text-muted-foreground hover:text-foreground">
                        <ArrowLeftRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Modal isOpen={!!vendaItens} onClose={() => setVendaItens(null)} title={`Itens da Venda #${vendaItens?.vendaId ?? ""}`}>
          <div className="space-y-4">
            {vendaItens?.itens.map((item) => (
              <div key={item.id} className="flex justify-between items-center p-4 bg-secondary/30 rounded-xl border border-border">
                <div>
                  <p className="font-bold">{item.nome_snap}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.unidades != null && item.unidades > 0
                      ? `${item.unidades} un — ${item.quantidade.toFixed(3)} kg × ${formatMoney(item.preco_unit)} /kg`
                      : `${item.quantidade} × ${formatMoney(item.preco_unit)}`}
                  </p>
                </div>
                <div className="font-mono font-bold">{formatMoney(item.subtotal)}</div>
              </div>
            ))}
          </div>
        </Modal>

        <Modal isOpen={!!transferirVendaId} onClose={() => { setTransferirVendaId(null); setNovoOperadorId(""); }} title={`Transferir Venda #${transferirVendaId ?? ""}`}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Escolha pra qual usuário essa venda deve ficar registrada.</p>
            <Select value={novoOperadorId} onChange={(e) => setNovoOperadorId(e.target.value)}>
              <option value="">Selecione...</option>
              {usuarios.filter((u) => u.id !== selecionado.id).map((u) => (
                <option key={u.id} value={u.id}>{u.nome} {u.sobrenome ?? ""}</option>
              ))}
            </Select>
            <Button className="w-full" disabled={!novoOperadorId} onClick={confirmarTransferencia}>Confirmar transferência</Button>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 h-full overflow-y-auto max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Usuários</h1>
        <p className="text-muted-foreground mt-1">Operadores do PDV e o total vendido por cada um</p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {usuarios.map((u) => (
            <div key={u.id} className={`bg-card border border-border rounded-2xl p-5 shadow-sm flex items-center gap-4 ${!u.ativo ? "opacity-50" : ""}`}>
              <button onClick={() => abrirUsuario(u)} className="flex items-center gap-4 flex-1 text-left">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: u.cor }}>
                  {u.iniciais}
                </div>
                <div>
                  <p className="font-bold">{u.nome} {u.sobrenome ?? ""} {!u.ativo && <span className="text-xs text-muted-foreground">(inativo)</span>}</p>
                  <p className="text-sm text-muted-foreground">{u.qtd_vendas} vendas</p>
                  <p className="font-mono font-bold text-primary">{formatMoney(u.total_vendido)}</p>
                </div>
              </button>
              {u.ativo && (
                <button onClick={() => excluirUsuario(u)} title="Inativar operador" className="text-muted-foreground hover:text-destructive p-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
