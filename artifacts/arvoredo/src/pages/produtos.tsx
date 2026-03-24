import React, { useState } from "react";
import { useProdutos, useCriarProdutoWrapper, useEditarProdutoWrapper, useDeletarProdutoWrapper } from "@/hooks/use-produtos";
import { formatMoney } from "@/lib/utils";
import { Button, Input, Select, Modal } from "@/components/ui-elements";
import { Search, Plus, Edit2, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Produto, CriarProdutoInputCategoria } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Produtos() {
  const [search, setSearch] = useState("");
  const { data: produtos = [], isLoading } = useProdutos({ q: search });
  
  const criar = useCriarProdutoWrapper();
  const editar = useEditarProdutoWrapper();
  const deletar = useDeletarProdutoWrapper();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const defaultForm = {
    nome: "", marca: "", codigo: "", categoria: "mercado" as CriarProdutoInputCategoria, 
    preco: "", custo: "", estoque: "", estoque_min: "5", unidade: "un"
  };
  const [formData, setFormData] = useState(defaultForm);

  const handleOpenNew = () => {
    setEditingId(null);
    setFormData(defaultForm);
    setModalOpen(true);
  };

  const handleOpenEdit = (p: Produto) => {
    setEditingId(p.id);
    setFormData({
      nome: p.nome,
      marca: p.marca || "",
      codigo: p.codigo || "",
      categoria: p.categoria,
      preco: p.preco.toString(),
      custo: p.custo.toString(),
      estoque: p.estoque.toString(),
      estoque_min: p.estoque_min.toString(),
      unidade: p.unidade
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nome: formData.nome,
      marca: formData.marca || null,
      codigo: formData.codigo || null,
      categoria: formData.categoria,
      preco: Number(formData.preco),
      custo: Number(formData.custo) || 0,
      estoque: Number(formData.estoque) || 0,
      estoque_min: Number(formData.estoque_min) || 0,
      unidade: formData.unidade || 'un'
    };

    if (editingId) {
      editar.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Produto atualizado", className: "bg-green-600 text-white" });
          setModalOpen(false);
        }
      });
    } else {
      criar.mutate({ data: payload }, {
        onSuccess: () => {
          toast({ title: "Produto criado", className: "bg-green-600 text-white" });
          setModalOpen(false);
        }
      });
    }
  };

  const handleDelete = () => {
    if (!deleteModal) return;
    deletar.mutate({ id: deleteModal }, {
      onSuccess: () => {
        toast({ title: "Produto excluído", className: "bg-green-600 text-white" });
        setDeleteModal(null);
      }
    });
  };

  return (
    <div className="p-6 md:p-8 h-full overflow-y-auto max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Produtos</h1>
          <p className="text-muted-foreground mt-1">Gerencie o catálogo de produtos e preços</p>
        </div>
        <Button onClick={handleOpenNew} className="gap-2" size="lg">
          <Plus className="w-5 h-5" />
          Novo Produto
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-border bg-secondary/20 flex items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nome, marca ou código..." 
              className="pl-10 h-12"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        
        <div className="overflow-x-auto flex-1">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground">Carregando catálogo...</div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-muted-foreground text-sm uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Cód.</th>
                  <th className="px-6 py-4 font-medium">Nome</th>
                  <th className="px-6 py-4 font-medium">Marca</th>
                  <th className="px-6 py-4 font-medium">Cat.</th>
                  <th className="px-6 py-4 font-medium text-right">Custo</th>
                  <th className="px-6 py-4 font-medium text-right">Preço Venda</th>
                  <th className="px-6 py-4 font-medium text-right">Estoque</th>
                  <th className="px-6 py-4 font-medium text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {produtos.map(p => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4 text-muted-foreground font-mono text-sm">{p.codigo || '-'}</td>
                    <td className="px-6 py-4 font-bold">{p.nome}</td>
                    <td className="px-6 py-4 text-muted-foreground">{p.marca || '-'}</td>
                    <td className="px-6 py-4 capitalize">
                      <span className={`px-2 py-1 text-xs font-bold rounded-full ${p.categoria === 'cozinha' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {p.categoria}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-muted-foreground">{formatMoney(p.custo)}</td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-primary">{formatMoney(p.preco)}</td>
                    <td className="px-6 py-4 text-right font-mono font-medium">{p.estoque} <span className="text-xs text-muted-foreground">{p.unidade}</span></td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleOpenEdit(p)} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteModal(p.id)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Editar Produto" : "Novo Produto"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nome Base (ID) *</label>
              <Input required value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} placeholder="Ex: Arroz" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Marca / Variação</label>
              <Input value={formData.marca} onChange={e => setFormData({...formData, marca: e.target.value})} placeholder="Ex: PratoFino 5kg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Código (Barras)</label>
              <Input value={formData.codigo} onChange={e => setFormData({...formData, codigo: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Categoria *</label>
              <Select required value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value as CriarProdutoInputCategoria})}>
                <option value="mercado">Mercado</option>
                <option value="cozinha">Cozinha / Lanchonete</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Custo (R$)</label>
              <Input type="number" step="0.01" min="0" value={formData.custo} onChange={e => setFormData({...formData, custo: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Preço Venda (R$) *</label>
              <Input required type="number" step="0.01" min="0" value={formData.preco} onChange={e => setFormData({...formData, preco: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Estoque Inicial</label>
              <Input type="number" step="0.01" value={formData.estoque} onChange={e => setFormData({...formData, estoque: e.target.value})} disabled={!!editingId} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Estoque Min.</label>
              <Input type="number" step="0.01" value={formData.estoque_min} onChange={e => setFormData({...formData, estoque_min: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Unidade</label>
              <Input value={formData.unidade} onChange={e => setFormData({...formData, unidade: e.target.value})} placeholder="un, kg, L" />
            </div>
          </div>
          <div className="pt-6 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={criar.isPending || editar.isPending}>
              {editingId ? "Salvar Alterações" : "Criar Produto"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} title="Excluir Produto">
        <div className="space-y-6">
          <div className="bg-destructive/10 text-destructive p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <p>Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita e ele não aparecerá mais no PDV.</p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteModal(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletar.isPending}>
              {deletar.isPending ? "Excluindo..." : "Sim, Excluir"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
