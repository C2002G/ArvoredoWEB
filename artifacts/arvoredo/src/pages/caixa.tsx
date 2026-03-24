import React, { useState } from "react";
import { useCaixaStatus, useCaixaHistorico, useCaixaSangrias, useAbrirCaixaWrapper, useFecharCaixaWrapper, useRegistrarSangriaWrapper } from "@/hooks/use-caixa";
import { formatMoney, formatDate } from "@/lib/utils";
import { Button, Input, Modal } from "@/components/ui-elements";
import { Wallet, LogOut, Download, LockOpen, Lock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Caixa() {
  const { data: status, isLoading: loadingStatus } = useCaixaStatus();
  const { data: historico = [] } = useCaixaHistorico();
  const sessaoId = status?.sessao?.id;
  const { data: sangrias = [] } = useCaixaSangrias({ sessao_id: sessaoId });
  
  const abrirCaixa = useAbrirCaixaWrapper();
  const fecharCaixa = useFecharCaixaWrapper();
  const registrarSangria = useRegistrarSangriaWrapper();
  const { toast } = useToast();

  const [fundoInicial, setFundoInicial] = useState("");
  const [sangriaForm, setSangriaForm] = useState({ valor: "", motivo: "" });
  const [fecharModal, setFecharModal] = useState(false);

  const handleAbrir = (e: React.FormEvent) => {
    e.preventDefault();
    abrirCaixa.mutate({ data: { fundo_inicial: Number(fundoInicial) || 0 } }, {
      onSuccess: () => {
        toast({ title: "Caixa aberto", className: "bg-green-600 text-white" });
        setFundoInicial("");
      }
    });
  };

  const handleSangria = (e: React.FormEvent) => {
    e.preventDefault();
    registrarSangria.mutate({ data: { valor: Number(sangriaForm.valor), motivo: sangriaForm.motivo } }, {
      onSuccess: () => {
        toast({ title: "Sangria registrada", className: "bg-green-600 text-white" });
        setSangriaForm({ valor: "", motivo: "" });
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

  if (loadingStatus) return <div className="p-8">Carregando...</div>;

  const totalCalculado = status?.sessao 
    ? status.sessao.fundo_inicial + status.sessao.total_dinheiro - status.sessao.total_sangria 
    : 0;

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
                placeholder="R$ 0,00"
                value={fundoInicial}
                onChange={e => setFundoInicial(e.target.value)}
                className="text-xl h-14 font-mono text-center font-bold"
              />
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
                <Button variant="destructive" className="w-full mt-6 gap-2" onClick={() => setFecharModal(true)}>
                  <LogOut className="w-5 h-5" />
                  Fechar Caixa
                </Button>
              </div>
            </div>

            {/* Metrics */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-4 border-b border-border pb-4">Resumo da Sessão</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Fiado</p>
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
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Download className="text-orange-500" /> Registrar Sangria
              </h3>
              <form onSubmit={handleSangria} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Valor Retirado (R$)</label>
                  <Input required type="number" step="0.01" min="0.01" max={totalCalculado} value={sangriaForm.valor} onChange={e => setSangriaForm({...sangriaForm, valor: e.target.value})} className="font-mono" />
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
                      <p className="text-xs text-muted-foreground">{formatDate(s.criado_em).split(' ')[1]}</p>
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
