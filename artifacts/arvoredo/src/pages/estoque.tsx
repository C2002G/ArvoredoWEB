import React, { useState } from "react";
import { useProdutos, useProdutosAlertas } from "@/hooks/use-produtos";
import { useMovimentarEstoqueWrapper, useEstoqueMovimentos } from "@/hooks/use-estoque";
import { Button, Input, Select, Modal } from "@/components/ui-elements";
import { formatMoney, formatDate } from "@/lib/utils";
import { AlertTriangle, Plus, ArrowDownRight, ArrowUpRight, ArrowRightLeft, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { MovimentoEstoqueInputTipo } from "@workspace/api-client-react/src/generated/api.schemas";

function formatValidade(validade: string | null | undefined) {
  if (!validade) return null;
  const [ano, mes, dia] = validade.split("-");
  return `${dia}/${mes}/${ano}`;
}

function validadeStatus(validade: string | null | undefined): null | "vencido" | "vencendo" {
  if (!validade) return null;
  const hoje = new Date();
  const val = new Date(validade + "T12:00:00");
  const diff = (val.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "vencido";
  if (diff <= 7) return "vencendo";
  return null;
}

export default function Estoque() {
  const { data: produtos = [] } = useProdutos();
  const { data: alertasObj } = useProdutosAlertas();
  const { data: movimentos = [] } = useEstoqueMovimentos({ limit: 20 });
  const movimentar = useMovimentarEstoqueWrapper();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    produto_id: "",
    tipo: "entrada" as MovimentoEstoqueInputTipo,
    quantidade: "",
    motivo: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.produto_id || !formData.quantidade) return;

    movimentar.mutate({
      data: {
        produto_id: Number(formData.produto_id),
        tipo: formData.tipo,
        quantidade: Number(formData.quantidade),
        motivo: formData.motivo || null
      }
    }, {
      onSuccess: () => {
        toast({ title: "Sucesso", description: "Estoque atualizado.", className: "bg-green-600 text-white" });
        setModalOpen(false);
        setFormData({ produto_id: "", tipo: "entrada", quantidade: "", motivo: "" });
      },
      onError: (err) => {
        toast({ title: "Erro", description: err.message, variant: "destructive" });
      }
    });
  };

  const estoqueBaixo = alertasObj?.estoque_baixo || [];
  const vencendo = alertasObj?.vencendo || [];
  const vencidos = alertasObj?.vencidos || [];

  return (
    <div className="p-6 md:p-8 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Estoque</h1>
          <p className="text-muted-foreground mt-1">Gerencie a entrada e saída de produtos</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="gap-2">
          <Plus className="w-5 h-5" />
          Nova Movimentação
        </Button>
      </div>

      {/* Alertas de Estoque Baixo */}
      {estoqueBaixo.length > 0 && (
        <div className="mb-6 bg-destructive/10 border border-destructive/20 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 text-destructive mb-4">
            <AlertTriangle className="w-6 h-6" />
            <h2 className="text-lg font-bold">Estoque Baixo ({estoqueBaixo.length})</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {estoqueBaixo.map(p => (
              <div key={p.id} className="bg-white p-4 rounded-xl shadow-sm border border-destructive/10 flex justify-between items-center">
                <div>
                  <p className="font-semibold">{p.nome} {p.marca ? `- ${p.marca}` : ''}</p>
                  <p className="text-sm text-muted-foreground">Mín: {p.estoque_min}</p>
                </div>
                <div className="text-2xl font-bold font-mono text-destructive">
                  {p.estoque}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alertas de Validade */}
      {(vencidos.length > 0 || vencendo.length > 0) && (
        <div className="mb-6 space-y-4">
          {vencidos.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 text-red-700 mb-4">
                <Calendar className="w-6 h-6" />
                <h2 className="text-lg font-bold">Produtos Vencidos ({vencidos.length})</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vencidos.map(p => (
                  <div key={p.id} className="bg-white p-4 rounded-xl shadow-sm border border-red-100 flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{p.nome} {p.marca ? `- ${p.marca}` : ''}</p>
                      <p className="text-sm text-red-600 font-bold flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {formatValidade(p.validade)}
                      </p>
                    </div>
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">VENCIDO</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {vencendo.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 text-yellow-700 mb-4">
                <Calendar className="w-6 h-6" />
                <h2 className="text-lg font-bold">Vencendo em Breve ({vencendo.length}) — próximos 7 dias</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vencendo.map(p => (
                  <div key={p.id} className="bg-white p-4 rounded-xl shadow-sm border border-yellow-100 flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{p.nome} {p.marca ? `- ${p.marca}` : ''}</p>
                      <p className="text-sm text-yellow-600 font-bold flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {formatValidade(p.validade)}
                      </p>
                    </div>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full">ATENÇÃO</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2">
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-6 border-b border-border bg-secondary/20">
              <h3 className="font-bold text-lg">Situação Atual</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/50 text-muted-foreground text-sm uppercase">
                  <tr>
                    <th className="px-4 py-4 font-medium">Produto</th>
                    <th className="px-4 py-4 font-medium">Categoria</th>
                    <th className="px-4 py-4 font-medium text-right">Estoque</th>
                    <th className="px-4 py-4 font-medium">Validade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {produtos.map(p => {
                    const vs = validadeStatus(p.validade);
                    return (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-4 font-medium">{p.nome} {p.marca ? `- ${p.marca}` : ''}</td>
                        <td className="px-4 py-4 capitalize">{p.categoria}</td>
                        <td className={`px-4 py-4 text-right font-bold font-mono ${p.estoque <= p.estoque_min ? 'text-destructive' : 'text-primary'}`}>
                          {p.estoque} <span className="text-xs font-normal text-muted-foreground">{p.unidade}</span>
                        </td>
                        <td className="px-4 py-4">
                          {p.validade ? (
                            <span className={`flex items-center gap-1 text-sm font-medium ${
                              vs === 'vencido' ? 'text-destructive' : vs === 'vencendo' ? 'text-yellow-600' : 'text-muted-foreground'
                            }`}>
                              <Calendar className="w-3 h-3" />
                              {formatValidade(p.validade)}
                              {vs === 'vencido' && <span className="ml-1 text-xs font-bold bg-red-100 text-red-700 px-1 rounded">VENCIDO</span>}
                              {vs === 'vencendo' && <span className="ml-1 text-xs font-bold bg-yellow-100 text-yellow-700 px-1 rounded">!</span>}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="xl:col-span-1">
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-6 border-b border-border bg-secondary/20">
              <h3 className="font-bold text-lg">Últimas Movimentações</h3>
            </div>
            <div className="p-4 space-y-4">
              {movimentos.map(m => (
                <div key={m.id} className="flex gap-4 p-4 rounded-xl border border-border bg-secondary/10">
                  <div className={`p-3 rounded-xl flex items-center justify-center ${
                    m.tipo === 'entrada' ? 'bg-green-100 text-green-700' :
                    m.tipo === 'saida' ? 'bg-red-100 text-red-700' : 'bg-primary/10 text-primary'
                  }`}>
                    {m.tipo === 'entrada' ? <ArrowDownRight className="w-5 h-5" /> :
                     m.tipo === 'saida' ? <ArrowUpRight className="w-5 h-5" /> :
                     <ArrowRightLeft className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold line-clamp-1">{m.produto_nome}</h4>
                      <span className={`font-mono font-bold ${
                        m.tipo === 'entrada' ? 'text-green-600' :
                        m.tipo === 'saida' ? 'text-red-600' : 'text-primary'
                      }`}>
                        {m.tipo === 'saida' ? '-' : '+'}{m.quantidade}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 capitalize">{m.tipo} • {formatDate(m.criado_em)}</p>
                    {m.motivo && <p className="text-sm mt-1">{m.motivo}</p>}
                  </div>
                </div>
              ))}
              {movimentos.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhuma movimentação registrada.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nova Movimentação">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Produto *</label>
            <Select required value={formData.produto_id} onChange={(e) => setFormData({...formData, produto_id: e.target.value})}>
              <option value="">Selecione um produto</option>
              {produtos.map(p => (
                <option key={p.id} value={p.id}>{p.nome} {p.marca ? `- ${p.marca}` : ''} (Atual: {p.estoque})</option>
              ))}
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo *</label>
              <Select required value={formData.tipo} onChange={(e) => setFormData({...formData, tipo: e.target.value as MovimentoEstoqueInputTipo})}>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
                <option value="ajuste">Ajuste / Balanço</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Quantidade *</label>
              <Input required type="number" min="0.01" step="0.01" value={formData.quantidade} onChange={(e) => setFormData({...formData, quantidade: e.target.value})} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Motivo / Observação</label>
            <Input value={formData.motivo} onChange={(e) => setFormData({...formData, motivo: e.target.value})} placeholder="Ex: Compra NF 1234" />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={movimentar.isPending}>
              {movimentar.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
