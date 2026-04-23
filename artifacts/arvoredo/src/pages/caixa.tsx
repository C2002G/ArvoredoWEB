import React, { useState } from "react";
import { useCaixaStatus, useCaixaHistorico, useCaixaSangrias, useAbrirCaixaWrapper, useFecharCaixaWrapper, useRegistrarSangriaWrapper } from "@/hooks/use-caixa";
import { useImprimirSangria } from "@/hooks/use-impressora";
import { formatMoney, formatDate } from "@/lib/utils";
import { Button, Input, Modal } from "@/components/ui-elements";
import { Wallet, LogOut, Download, LockOpen, Lock, AlertCircle, Printer, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Caixa() {
  const { data: status, isLoading: loadingStatus } = useCaixaStatus();
  const { data: historico = [] } = useCaixaHistorico();
  const sessaoId = status?.sessao?.id;
  const { data: sangrias = [] } = useCaixaSangrias({ sessao_id: sessaoId });
  
  const abrirCaixa = useAbrirCaixaWrapper();
  const fecharCaixa = useFecharCaixaWrapper();
  const registrarSangria = useRegistrarSangriaWrapper();
  const imprimirSangria = useImprimirSangria();
  const { toast } = useToast();

  const hoje = new Date().toISOString().split('T')[0];
  const [fundoInicial, setFundoInicial] = useState("300");
  const [sangriaForm, setSangriaForm] = useState({ valor: "300", motivo: "" });
  const [fecharModal, setFecharModal] = useState(false);
  const [imprimirModal, setImprimirModal] = useState(false);
  const [periodoImpressao, setPeriodoImpressao] = useState({ inicio: hoje, fim: hoje });
  const [imprimindoTexto, setImprimindoTexto] = useState<string | null>(null);

  const handleAbrir = (e: React.FormEvent) => {
    e.preventDefault();
    abrirCaixa.mutate({ data: { fundo_inicial: Number(fundoInicial) || 300 } }, {
      onSuccess: () => {
        toast({ title: "Caixa aberto", className: "bg-green-600 text-white" });
      }
    });
  };

  const handleSangria = (e: React.FormEvent) => {
    e.preventDefault();
    registrarSangria.mutate({ data: { valor: Number(sangriaForm.valor), motivo: sangriaForm.motivo || null } }, {
      onSuccess: () => {
        toast({ title: "Sangria registrada", className: "bg-green-600 text-white" });
        setSangriaForm({ valor: "300", motivo: "" });
      }
    });
  };

  const handleFechar = () => {
    fecharCaixa.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Caixa fechado com sucesso", className: "bg-green-600 text-white" });
        setFecharModal(false);
      }
    });
  };

  const handleImprimirSangria = () => {
    imprimirSangria.mutate({
      data: {
        data_inicio: periodoImpressao.inicio,
        data_fim: periodoImpressao.fim,
        sessao_id: sessaoId || null,
      }
    }, {
      onSuccess: (res: any) => {
        if (res.ok && res.simulado && res.texto) {
          setImprimindoTexto(res.texto);
        } else if (res.ok) {
          toast({ title: "Relatório impresso com sucesso!", className: "bg-green-600 text-white" });
          setImprimirModal(false);
        } else {
          toast({ title: "Erro na impressora", description: res.erro, variant: "destructive" });
        }
      }
    });
  };

  if (loadingStatus) return <div className="p-8">Carregando...</div>;

  const totalCalculado = status?.sessao 
    ? status.sessao.fundo_inicial + status.sessao.total_dinheiro - status.sessao.total_sangria 
    : 0;

  const s = status?.sessao;
  const totalFormasPagamento = s
    ? s.total_dinheiro + s.total_pix + s.total_cartao + s.total_fiado
    : 0;
  const retiradaFundoMenosTotal = s ? s.fundo_inicial - totalFormasPagamento : 0;

  return (
    <div className="p-6 md:p-8 h-full overflow-y-auto max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Sessão de Caixa</h1>
        <p className="text-muted-foreground mt-1">Gerencie a abertura, fechamento e sangrias do caixa atual</p>
      </div>

      {!status?.aberto ? (
        <div className="bg-card max-w-md mx-auto rounded-3xl p-8 border border-border shadow-lg text-center mt-12">
          <div className="bg-muted w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-6">
            <Lock className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Caixa Fechado</h2>
          <p className="text-muted-foreground mb-8">Abra uma nova sessão para começar a registrar vendas.</p>
          
          <form onSubmit={handleAbrir} className="space-y-6 text-left">
            <div>
              <label className="block text-sm font-medium mb-2">Fundo Inicial (Troco)</label>
              <Input 
                type="number" 
                step="0.01" 
                min="0"
                placeholder="R$ 300,00"
                value={fundoInicial}
                onChange={e => setFundoInicial(e.target.value)}
                className="text-xl h-14 font-mono text-center font-bold"
              />
              <p className="text-xs text-muted-foreground mt-1 text-center">Padrão: R$ 300,00</p>
            </div>
            <Button size="lg" className="w-full h-14 text-lg" disabled={abrirCaixa.isPending}>
              <LockOpen className="w-5 h-5 mr-2" />
              {abrirCaixa.isPending ? "Abrindo..." : "Abrir Caixa"}
            </Button>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Status and Actions */}
          <div className="lg:col-span-2 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-primary text-primary-foreground rounded-2xl p-6 shadow-md">
                <div className="flex items-center gap-2 mb-4 opacity-80">
                  <Wallet className="w-5 h-5" />
                  <span className="font-semibold uppercase tracking-wider text-sm">Total em Gaveta</span>
                </div>
                <div className="text-4xl font-black font-mono">{formatMoney(totalCalculado)}</div>
                <p className="mt-4 text-sm opacity-80">Fundo + Vendas (Dinheiro) - Sangrias</p>
              </div>
              
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-lg mb-1">Status: Aberto</h3>
                  <p className="text-muted-foreground text-sm">Desde {formatDate(status.sessao!.aberto_em)}</p>
                </div>
                <div className="flex flex-col gap-3 mt-6">
                  <Button variant="outline" className="w-full gap-2" onClick={() => setImprimirModal(true)}>
                    <Printer className="w-4 h-4" />
                    Imprimir Relatório
                  </Button>
                  <Button variant="destructive" className="w-full gap-2" onClick={() => setFecharModal(true)}>
                    <LogOut className="w-5 h-5" />
                    Fechar Caixa
                  </Button>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-4 border-b border-border pb-4">Resumo da Sessão</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-primary/10 border border-primary/25 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">TOTAL</p>
                  <p className="font-mono font-bold text-lg text-primary">{formatMoney(totalFormasPagamento)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-tight">Dinheiro + PIX + Cartão + Comandas</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-xl border border-border">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Retirada</p>
                  <p className={`font-mono font-bold text-lg ${retiradaFundoMenosTotal < 0 ? "text-destructive" : "text-foreground"}`}>
                    {formatMoney(retiradaFundoMenosTotal)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-tight">Fundo inicial − TOTAL</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Fundo Inicial</p>
                  <p className="font-mono font-bold">{formatMoney(status.sessao!.fundo_inicial)}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Dinheiro</p>
                  <p className="font-mono font-bold text-green-600">{formatMoney(status.sessao!.total_dinheiro)}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">PIX</p>
                  <p className="font-mono font-bold">{formatMoney(status.sessao!.total_pix)}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Cartão</p>
                  <p className="font-mono font-bold">{formatMoney(status.sessao!.total_cartao)}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Comandas</p>
                  <p className="font-mono font-bold text-destructive">{formatMoney(status.sessao!.total_fiado)}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Sangrias</p>
                  <p className="font-mono font-bold text-orange-600">{formatMoney(status.sessao!.total_sangria)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Sangria */}
          <div className="space-y-8">
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                <Download className="text-orange-500" /> Registrar Sangria
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Padrão: R$300. O valor excedente em dinheiro é retirado como sangria.</p>
              <form onSubmit={handleSangria} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Valor Retirado (R$)</label>
                  <Input required type="number" step="0.01" min="0.01" value={sangriaForm.valor} onChange={e => setSangriaForm({...sangriaForm, valor: e.target.value})} className="font-mono font-bold text-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Motivo (Opcional)</label>
                  <Input value={sangriaForm.motivo} onChange={e => setSangriaForm({...sangriaForm, motivo: e.target.value})} placeholder="Ex: Pagamento fornecedor" />
                </div>
                <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white" disabled={registrarSangria.isPending}>
                  Confirmar Retirada
                </Button>
              </form>
            </div>

            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-4">Sangrias do Dia</h3>
              <div className="space-y-3">
                {sangrias.map(s => (
                  <div key={s.id} className="flex justify-between items-center p-3 bg-secondary/30 rounded-xl border border-border">
                    <div>
                      <p className="font-bold text-orange-600 font-mono">-{formatMoney(s.valor)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(s.criado_em)}</p>
                    </div>
                    {s.motivo && <span className="text-sm">{s.motivo}</span>}
                  </div>
                ))}
                {sangrias.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma sangria registrada.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Histórico Geral */}
      <div className="mt-12">
        <h3 className="font-bold text-2xl mb-6">Histórico de Sessões</h3>
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-muted-foreground text-sm uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Abertura</th>
                  <th className="px-6 py-4 font-medium">Fechamento</th>
                  <th className="px-6 py-4 font-medium text-right">Fundo</th>
                  <th className="px-6 py-4 font-medium text-right">Vendas</th>
                  <th className="px-6 py-4 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {historico.map(h => (
                  <tr key={h.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4">{formatDate(h.aberto_em)}</td>
                    <td className="px-6 py-4">{h.fechado_em ? formatDate(h.fechado_em) : '-'}</td>
                    <td className="px-6 py-4 text-right font-mono">{formatMoney(h.fundo_inicial)}</td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-primary">
                      {formatMoney(h.total_dinheiro + h.total_pix + h.total_cartao + h.total_fiado)}
                    </td>
                    <td className="px-6 py-4 flex justify-center">
                      <span className={`px-3 py-1 text-xs font-bold rounded-full ${h.status === 'aberto' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                        {h.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Imprimir Relatório */}
      <Modal isOpen={imprimirModal} onClose={() => { setImprimirModal(false); setImprimindoTexto(null); }} title="Imprimir Relatório de Vendas">
        {imprimindoTexto ? (
          <div className="space-y-4">
            <div className="bg-muted rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-2">Pré-visualização (impressora não encontrada — copie o texto):</p>
              <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto max-h-64">{imprimindoTexto}</pre>
            </div>
            <Button className="w-full" onClick={() => { setImprimindoTexto(null); setImprimirModal(false); }}>Fechar</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">Selecione o período para o relatório de vendas / sangria.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center gap-1"><Calendar className="w-4 h-4" /> Data Início</label>
                <Input type="date" value={periodoImpressao.inicio} onChange={e => setPeriodoImpressao({...periodoImpressao, inicio: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center gap-1"><Calendar className="w-4 h-4" /> Data Fim</label>
                <Input type="date" value={periodoImpressao.fim} onChange={e => setPeriodoImpressao({...periodoImpressao, fim: e.target.value})} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setImprimirModal(false)}>Cancelar</Button>
              <Button className="gap-2" onClick={handleImprimirSangria} disabled={imprimirSangria.isPending}>
                <Printer className="w-4 h-4" />
                {imprimirSangria.isPending ? "Imprimindo..." : "Imprimir"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={fecharModal} onClose={() => setFecharModal(false)} title="Confirmar Fechamento">
        <div className="space-y-6">
          <div className="bg-destructive/10 text-destructive p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <p>Tem certeza que deseja fechar o caixa? Esta ação não pode ser desfeita e você não poderá registrar novas vendas até abrir uma nova sessão.</p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setFecharModal(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleFechar} disabled={fecharCaixa.isPending}>
              {fecharCaixa.isPending ? "Fechando..." : "Sim, Fechar Caixa"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
