import React, { useEffect, useMemo, useState } from "react";
import { useVendasList, useVendasResumoHoje, useVendaItens } from "@/hooks/use-vendas";
import { formatMoney, formatDate } from "@/lib/utils";
import { Input, Select, Modal } from "@/components/ui-elements";
import { TrendingUp, Calendar, Utensils, ShoppingBasket, Filter, Receipt, Leaf } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type NfceStatus = "autorizada" | "rejeitada" | "processando" | "erro" | "sem_emissao";
type StatusMap = Record<number, NfceStatus>;

export default function Historico() {
  const [dataFilter, setDataFilter] = useState(new Date().toISOString().split('T')[0]);
  const [catFilter, setCatFilter] = useState("");
  
  const { data: resumo } = useVendasResumoHoje();
  const { data: vendas = [], isLoading } = useVendasList({ data: dataFilter, categoria: catFilter || undefined });
  
  const [selectedVendaId, setSelectedVendaId] = useState<number | null>(null);
  const [menuVendaId, setMenuVendaId] = useState<number | null>(null);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const { toast } = useToast();
  const { data: itens = [], isLoading: loadingItens } = useVendaItens(selectedVendaId);

  useEffect(() => {
    let active = true;
    if (!vendas.length) {
      setStatusMap({});
      return;
    }
    (async () => {
      const statuses = await Promise.all(
        vendas.map(async (v) => {
          try {
            const resp = await fetch(`/api/nfce/status/${v.id}`);
            if (!resp.ok) return [v.id, "erro"] as const;
            const data = await resp.json();
            return [v.id, (data?.status || "sem_emissao") as NfceStatus] as const;
          } catch {
            return [v.id, "erro"] as const;
          }
        }),
      );
      if (!active) return;
      setStatusMap(Object.fromEntries(statuses));
    })();
    return () => {
      active = false;
    };
  }, [vendas]);

  const statusLabel = useMemo(
    () =>
      ({
        autorizada: "✅ Autorizada",
        rejeitada: "❌ Rejeitada",
        processando: "🕒 Processando",
        erro: "❌ Erro",
        sem_emissao: "🕒 Sem emissao",
      }) as Record<NfceStatus, string>,
    [],
  );

  const runNfceAction = async (vendaId: number, action: "reimprimir" | "cancelar") => {
    const endpoint = action === "reimprimir" ? `/api/nfce/${vendaId}/reimprimir` : `/api/nfce/${vendaId}/cancelar`;
    try {
      const resp = await fetch(endpoint, { method: "POST" });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.message || "Falha na operacao");
      toast({ title: "Operacao concluida", description: body?.message || "Sucesso", className: "bg-green-600 text-white" });
      const statusResp = await fetch(`/api/nfce/status/${vendaId}`);
      if (statusResp.ok) {
        const statusBody = await statusResp.json();
        setStatusMap((prev) => ({ ...prev, [vendaId]: statusBody?.status || "sem_emissao" }));
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error?.message || "Falha ao executar acao NFC-e", variant: "destructive" });
    } finally {
      setMenuVendaId(null);
    }
  };

  return (
    <div className="p-6 md:p-8 h-full overflow-y-auto max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Histórico e Relatórios</h1>
        <p className="text-muted-foreground mt-1">Acompanhe as vendas e o desempenho do seu negócio</p>
      </div>

      {resumo && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-primary text-primary-foreground p-6 rounded-2xl shadow-md relative overflow-hidden">
            <TrendingUp className="absolute -right-4 -bottom-4 w-24 h-24 opacity-10" />
            <p className="font-semibold text-primary-foreground/80 mb-2 uppercase text-sm tracking-wider">Receita Hoje</p>
            <p className="text-4xl font-black font-mono">{formatMoney(resumo.total)}</p>
            <p className="mt-2 text-sm opacity-90">{resumo.num_vendas} vendas realizadas</p>
          </div>
          
          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <p className="font-semibold text-muted-foreground uppercase text-sm tracking-wider">Meios de Pagamento</p>
              <Receipt className="text-muted-foreground" />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Dinheiro</span><span className="font-mono font-bold text-green-600">{formatMoney(resumo.total_dinheiro)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">PIX</span><span className="font-mono font-bold">{formatMoney(resumo.total_pix)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cartão</span><span className="font-mono font-bold">{formatMoney(resumo.total_cartao)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Comandas</span><span className="font-mono font-bold text-destructive">{formatMoney(resumo.total_fiado)}</span></div>
            </div>
          </div>

          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-4">
              <div className="bg-blue-100 p-4 rounded-xl text-blue-600"><ShoppingBasket className="w-8 h-8" /></div>
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wider mb-1">Mercado</p>
                <p className="text-2xl font-bold font-mono">{formatMoney(resumo.mercado)}</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-4">
              <div className="bg-orange-100 p-4 rounded-xl text-orange-600"><Utensils className="w-8 h-8" /></div>
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wider mb-1">Cozinha</p>
                <p className="text-2xl font-bold font-mono text-orange-600">{formatMoney(resumo.cozinha)}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-4">
              <div className="bg-emerald-100 p-4 rounded-xl text-emerald-700"><Leaf className="w-8 h-8" /></div>
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wider mb-1">Feira</p>
                <p className="text-2xl font-bold font-mono text-emerald-700">{formatMoney(resumo.feira || 0)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-secondary/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="font-bold text-xl">Lista de Vendas</h3>
          <div className="flex gap-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-48">
              <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input type="date" className="pl-9" value={dataFilter} onChange={e => setDataFilter(e.target.value)} />
            </div>
            <div className="relative flex-1 sm:w-48">
              <Filter className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground z-10" />
              <Select className="pl-9" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                <option value="">Todas Categorias</option>
                <option value="mercado">Mercado</option>
                <option value="cozinha">Cozinha</option>
                <option value="feira">Feira</option>
              </Select>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando vendas...</div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-muted-foreground text-sm uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Data/Hora</th>
                  <th className="px-6 py-4 font-medium">Categoria</th>
                  <th className="px-6 py-4 font-medium">Pagamento</th>
                  <th className="px-6 py-4 font-medium">Cliente</th>
                  <th className="px-6 py-4 font-medium text-right">Total</th>
                  <th className="px-6 py-4 font-medium text-center">Status NFC-e</th>
                  <th className="px-6 py-4 font-medium text-center">Opções</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vendas.map(v => (
                  <tr key={v.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4">{formatDate(v.criado_em)}</td>
                    <td className="px-6 py-4 capitalize">
                      <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                        v.categoria === "cozinha"
                          ? "bg-orange-100 text-orange-700"
                          : v.categoria === "feira"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                      }`}>
                        {v.categoria}
                      </span>
                    </td>
                    <td className="px-6 py-4 capitalize font-medium">{v.pagamento}</td>
                    <td className="px-6 py-4 text-muted-foreground">{v.cliente_nome || '-'}</td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-foreground">{formatMoney(v.total)}</td>
                    <td className="px-6 py-4 text-center text-sm font-medium">{statusLabel[statusMap[v.id] || "processando"]}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() => setMenuVendaId((prev) => (prev === v.id ? null : v.id))}
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          Opções
                        </button>
                        {menuVendaId === v.id && (
                          <div className="absolute right-0 z-10 mt-2 w-44 rounded-md border border-border bg-background shadow-lg p-1">
                            <button onClick={() => { setSelectedVendaId(v.id); setMenuVendaId(null); }} className="w-full text-left px-3 py-2 text-sm hover:bg-secondary rounded-md">Ver Itens</button>
                            <button onClick={() => runNfceAction(v.id, "reimprimir")} className="w-full text-left px-3 py-2 text-sm hover:bg-secondary rounded-md">Reimprimir DANFE</button>
                            <button onClick={() => runNfceAction(v.id, "cancelar")} className="w-full text-left px-3 py-2 text-sm hover:bg-secondary rounded-md">Cancelar NFC-e</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {vendas.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma venda encontrada para os filtros aplicados.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal isOpen={!!selectedVendaId} onClose={() => setSelectedVendaId(null)} title={`Itens da Venda #${selectedVendaId}`}>
        {loadingItens ? (
          <div className="py-8 text-center">Carregando itens...</div>
        ) : (
          <div className="space-y-4">
            {itens.map(item => (
              <div key={item.id} className="flex justify-between items-center p-4 bg-secondary/30 rounded-xl border border-border">
                <div>
                  <p className="font-bold text-foreground">{item.nome_snap}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.unidades != null && item.unidades > 0
                      ? `${item.unidades} un — ${item.quantidade.toFixed(3)} kg × ${formatMoney(item.preco_unit)} /kg`
                      : `${item.quantidade} × ${formatMoney(item.preco_unit)}`}
                  </p>
                </div>
                <div className="font-mono font-bold text-lg">
                  {formatMoney(item.subtotal)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
