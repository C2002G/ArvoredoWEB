import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useProdutos, useCriarProdutoWrapper, useEditarProdutoWrapper, useDeletarProdutoWrapper } from "@/hooks/use-produtos";
import { formatMoney } from "@/lib/utils";
import { Button, Input, Select, Modal } from "@/components/ui-elements";
import { Search, Plus, Edit2, Trash2, AlertCircle, Calendar, Scan, X, ListRestart, FileUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Produto, CriarProdutoInputCategoria } from "@workspace/api-client-react/src/generated/api.schemas";

function formatValidade(validade: string | null | undefined) {
  if (!validade) return null;
  const [ano, mes, dia] = validade.split("-");
  return `${dia}/${mes}/${ano}`;
}

type SortCol =
  | "codigo"
  | "nome"
  | "marca"
  | "categoria"
  | "preco"
  | "estoque"
  | "validade"
  | "criado_em";

function validadeStatus(validade: string | null | undefined): null | "vencido" | "vencendo" {
  if (!validade) return null;
  const hoje = new Date();
  const val = new Date(validade + "T12:00:00");
  const diff = (val.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "vencido";
  if (diff <= 7) return "vencendo";
  return null;
}

type NfeItem = {
  codigoInterno: string;
  codigoBarras: string | null;
  descricao: string;
  ncm: string | null;
  cst: string | null;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
};

type NfeImportPreview = {
  chaveNfe: string | null;
  emitente: string | null;
  itens: NfeItem[];
};

function firstText(el: Element | null, tag: string): string {
  if (!el) return "";
  const found = el.getElementsByTagName(tag)[0];
  return found?.textContent?.trim() ?? "";
}

function toNum(v: string): number {
  const n = Number((v || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizeBarcode(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed || /^SEM\\s*GTIN$/i.test(trimmed)) return null;
  return trimmed;
}

function parseNfeXml(xmlText: string): NfeImportPreview {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error("XML inválido. Confira o arquivo e tente novamente.");
  }

  const infNFe = doc.getElementsByTagName("infNFe")[0] ?? null;
  const emit = doc.getElementsByTagName("emit")[0] ?? null;
  const xNome = firstText(emit, "xNome");
  const chaveRaw = infNFe?.getAttribute("Id") ?? "";
  const chaveNfe = chaveRaw.startsWith("NFe") ? chaveRaw.slice(3) : chaveRaw || null;

  const dets = Array.from(doc.getElementsByTagName("det"));
  const itens: NfeItem[] = dets
    .map((det) => {
      const prod = det.getElementsByTagName("prod")[0] ?? null;
      const imposto = det.getElementsByTagName("imposto")[0] ?? null;
      const icmsNodes = imposto ? Array.from(imposto.getElementsByTagName("*")) : [];
      const icms =
        icmsNodes.find((node) => /^ICMS/.test(node.tagName)) ??
        icmsNodes.find((node) => node.getElementsByTagName("CST")[0] || node.getElementsByTagName("CSOSN")[0]) ??
        null;

      const descricao = firstText(prod, "xProd");
      const quantidade = toNum(firstText(prod, "qCom"));
      const valorUnitario = toNum(firstText(prod, "vUnCom"));
      const valorTotal = toNum(firstText(prod, "vProd")) || quantidade * valorUnitario;

      return {
        codigoInterno: firstText(prod, "cProd"),
        codigoBarras: normalizeBarcode(firstText(prod, "cEAN") || firstText(prod, "cEANTrib")),
        descricao,
        ncm: firstText(prod, "NCM") || null,
        cst: firstText(icms, "CST") || firstText(icms, "CSOSN") || null,
        unidade: firstText(prod, "uCom") || "un",
        quantidade,
        valorUnitario,
        valorTotal,
      };
    })
    .filter((i) => i.descricao && i.quantidade > 0);

  if (itens.length === 0) {
    throw new Error("Nenhum item de produto encontrado no XML.");
  }

  return { chaveNfe, emitente: xNome || null, itens };
}

/* Campo de código de barras com botão de scanner */
function CodigoBarrasInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startScan = () => {
    setScanning(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const stopScan = () => setScanning(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setScanning(false); // código capturado, sai do modo scan
    }
  };

  return (
    <div className="space-y-2">
      {scanning ? (
        <div className="border-2 border-primary rounded-xl p-3 bg-primary/5 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <Scan className="w-5 h-5 text-primary animate-bounce" />
            <span className="text-sm font-semibold text-primary">Aponte o leitor para o produto...</span>
            <button type="button" onClick={stopScan} className="ml-auto text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (!value) setScanning(false); }}
            className="w-full bg-transparent border-none outline-none font-mono text-lg text-center tracking-widest text-foreground placeholder:text-muted-foreground"
            placeholder="aguardando leitura..."
            autoComplete="off"
          />
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Código de barras..."
            autoComplete="off"
            className="font-mono"
          />
          <Button
            type="button"
            variant="outline"
            className="flex-shrink-0 gap-1.5 border-primary/30 text-primary hover:border-primary"
            onClick={startScan}
            title="Ativar leitor de código de barras"
          >
            <Scan className="w-4 h-4" />
            Escanear
          </Button>
        </div>
      )}
      {value && !scanning && (
        <p className="text-xs text-muted-foreground font-mono">Código: {value}</p>
      )}
    </div>
  );
}

export default function Produtos() {
  const [search, setSearch] = useState("");
  const { data: produtos = [], isLoading } = useProdutos({ q: search });
  
  const criar = useCriarProdutoWrapper();
  const editar = useEditarProdutoWrapper();
  const deletar = useDeletarProdutoWrapper();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [xmlRaw, setXmlRaw] = useState("");
  const [xmlPreview, setXmlPreview] = useState<NfeImportPreview | null>(null);
  const [importingXml, setImportingXml] = useState(false);
  
  const defaultForm = {
    nome: "", marca: "", codigo: "", categoria: "mercado" as CriarProdutoInputCategoria,
    ncm: "", cfop: "5102", cest: "", cst: "", preco: "", custo: "", estoque: "", estoque_min: "5", unidade: "un", validade: ""
  };
  const [formData, setFormData] = useState(defaultForm);

  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = useCallback((col: SortCol) => {
    setSortCol((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return col;
    });
  }, []);

  const produtosOrdenados = useMemo(() => {
    if (!sortCol) return produtos;
    const list = [...produtos];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const cmpStr = (sa: string, sb: string) => sa.localeCompare(sb, "pt-BR", { sensitivity: "base" }) * dir;
      const cmpNum = (na: number, nb: number) => (na === nb ? 0 : na < nb ? -1 * dir : 1 * dir);

      switch (sortCol) {
        case "codigo":
          return cmpStr((a.codigo || "").toLowerCase(), (b.codigo || "").toLowerCase());
        case "nome":
          return cmpStr(a.nome.toLowerCase(), b.nome.toLowerCase());
        case "marca":
          return cmpStr((a.marca || "").toLowerCase(), (b.marca || "").toLowerCase());
        case "categoria":
          return cmpStr(a.categoria, b.categoria);
        case "preco":
          return cmpNum(a.preco, b.preco);
        case "estoque":
          return cmpNum(a.estoque, b.estoque);
        case "validade": {
          const ta = a.validade ? new Date(a.validade + "T12:00:00").getTime() : null;
          const tb = b.validade ? new Date(b.validade + "T12:00:00").getTime() : null;
          if (ta === null && tb === null) return 0;
          if (ta === null) return 1;
          if (tb === null) return -1;
          return (ta - tb) * dir;
        }
        case "criado_em":
          return cmpNum(new Date(a.criado_em).getTime(), new Date(b.criado_em).getTime());
        default:
          return 0;
      }
    });
    return list;
  }, [produtos, sortCol, sortDir]);

  const handleOpenNew = () => {
    setEditingId(null);
    setFormData(defaultForm);
    setModalOpen(true);
  };

  const handleOpenImport = () => {
    setXmlRaw("");
    setXmlPreview(null);
    setImportModalOpen(true);
  };

  const handleOpenEdit = (p: Produto) => {
    setEditingId(p.id);
    setFormData({
      nome: p.nome,
      marca: p.marca || "",
      codigo: p.codigo || "",
      categoria: p.categoria,
      ncm: p.ncm || "",
      cfop: (p as any).cfop || "5102",
      cest: (p as any).cest || "",
      cst: p.cst || "",
      preco: p.preco.toString(),
      custo: p.custo.toString(),
      estoque: p.estoque.toString(),
      estoque_min: p.estoque_min.toString(),
      unidade: p.unidade,
      validade: p.validade || ""
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
      ncm: formData.ncm || null,
      cfop: (formData as any).cfop || null,
      cest: (formData as any).cest || null,
      cst: formData.cst || null,
      preco: Number(formData.preco),
      custo: Number(formData.custo) || 0,
      estoque: Number(formData.estoque) || 0,
      estoque_min: Number(formData.estoque_min) || 0,
      unidade: formData.unidade || 'un',
      validade: formData.validade || null,
    };

    if (editingId) {
      editar.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Produto atualizado", className: "bg-green-600 text-white" });
          setModalOpen(false);
        },
        onError: (err) => {
          toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
        },
      });
    } else {
      criar.mutate({ data: payload }, {
        onSuccess: () => {
          toast({ title: "Produto criado", className: "bg-green-600 text-white" });
          setModalOpen(false);
        },
        onError: (err) => {
          toast({ title: "Erro ao criar", description: err.message, variant: "destructive" });
        },
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

  const parseXmlPreview = () => {
    try {
      const parsed = parseNfeXml(xmlRaw);
      setXmlPreview(parsed);
      toast({
        title: "XML lido com sucesso",
        description: `${parsed.itens.length} item(ns) encontrado(s).`,
        className: "bg-green-600 text-white",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao ler XML";
      toast({ title: "Erro no XML", description: message, variant: "destructive" });
      setXmlPreview(null);
    }
  };

  const runCriarProduto = (data: {
    nome: string;
    marca?: string | null;
    codigo?: string | null;
    categoria: CriarProdutoInputCategoria;
    ncm?: string | null;
    cfop?: string | null;
    cest?: string | null;
    cst?: string | null;
    preco: number;
    custo: number;
    estoque: number;
    estoque_min: number;
    unidade: string;
    validade?: string | null;
  }) =>
    new Promise<void>((resolve, reject) => {
      criar.mutate(
        { data },
        {
          onSuccess: () => resolve(),
          onError: (err) => reject(err),
        }
      );
    });

  const runEditarProduto = (
    id: number,
    data: {
      nome?: string;
      marca?: string | null;
      codigo?: string | null;
      categoria?: CriarProdutoInputCategoria;
      ncm?: string | null;
      cfop?: string | null;
      cest?: string | null;
      cst?: string | null;
      preco?: number;
      custo?: number;
      estoque?: number;
      estoque_min?: number;
      unidade?: string;
      validade?: string | null;
    }
  ) =>
    new Promise<void>((resolve, reject) => {
      editar.mutate(
        { id, data },
        {
          onSuccess: () => resolve(),
          onError: (err) => reject(err),
        }
      );
    });

  const handleImportarXml = async () => {
    if (!xmlPreview) {
      toast({
        title: "Leia o XML primeiro",
        description: "Clique em \"Ler XML\" antes de importar.",
        variant: "destructive",
      });
      return;
    }

    setImportingXml(true);
    try {
      let criados = 0;
      let atualizados = 0;
      const produtosPorCodigo = new Map(
        produtos
          .filter((p) => !!p.codigo)
          .map((p) => [p.codigo!.trim(), p] as const)
      );

      for (const item of xmlPreview.itens) {
        const existing = item.codigoBarras ? produtosPorCodigo.get(item.codigoBarras) : undefined;
        if (existing) {
          await runEditarProduto(existing.id, {
            ncm: existing.ncm || item.ncm,
            cst: existing.cst || item.cst,
            custo: item.valorUnitario,
            preco: existing.preco > 0 ? existing.preco : item.valorUnitario,
            estoque: existing.estoque + item.quantidade,
            unidade: existing.unidade || item.unidade,
          });
          atualizados++;
        } else {
          await runCriarProduto({
            nome: item.descricao,
            marca: null,
            codigo: item.codigoBarras,
            categoria: "mercado",
            ncm: item.ncm,
            cst: item.cst,
            preco: item.valorUnitario,
            custo: item.valorUnitario,
            estoque: item.quantidade,
            estoque_min: 5,
            unidade: item.unidade || "un",
            validade: null,
          });
          criados++;
        }
      }

      toast({
        title: "Importação concluída",
        description: `${criados} criado(s), ${atualizados} atualizado(s).`,
        className: "bg-green-600 text-white",
      });
      setImportModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao importar XML";
      toast({ title: "Erro na importação", description: message, variant: "destructive" });
    } finally {
      setImportingXml(false);
    }
  };

  return (
    <div className="p-6 md:p-8 h-full overflow-y-auto max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Produtos</h1>
          <p className="text-muted-foreground mt-1">Gerencie o catálogo de produtos e preços</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleOpenImport} variant="outline" className="gap-2" size="lg">
            <FileUp className="w-5 h-5" />
            Importar NF-e XML
          </Button>
          <Button onClick={handleOpenNew} className="gap-2" size="lg">
            <Plus className="w-5 h-5" />
            Novo Produto
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-border bg-secondary/20 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative w-full max-w-md flex-1">
            <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nome, marca ou código..." 
              className="pl-10 h-12"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {sortCol != null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={() => {
                setSortCol(null);
                setSortDir("asc");
              }}
            >
              <ListRestart className="w-4 h-4" />
              Limpar ordenação
            </Button>
          )}
        </div>
        
        <div className="overflow-x-auto flex-1">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground">Carregando catálogo...</div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-muted-foreground text-sm uppercase">
                <tr>
                  <th
                    className={`px-4 py-4 font-medium cursor-pointer select-none hover:bg-muted/80 ${sortCol === "codigo" ? "text-primary" : ""}`}
                    onClick={() => toggleSort("codigo")}
                  >
                    Cód.{sortCol === "codigo" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th
                    className={`px-4 py-4 font-medium cursor-pointer select-none hover:bg-muted/80 ${sortCol === "nome" ? "text-primary" : ""}`}
                    onClick={() => toggleSort("nome")}
                  >
                    Nome{sortCol === "nome" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th
                    className={`px-4 py-4 font-medium cursor-pointer select-none hover:bg-muted/80 ${sortCol === "marca" ? "text-primary" : ""}`}
                    onClick={() => toggleSort("marca")}
                  >
                    Marca{sortCol === "marca" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th
                    className={`px-4 py-4 font-medium cursor-pointer select-none hover:bg-muted/80 ${sortCol === "categoria" ? "text-primary" : ""}`}
                    onClick={() => toggleSort("categoria")}
                  >
                    Cat.{sortCol === "categoria" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th
                    className={`px-4 py-4 font-medium text-right cursor-pointer select-none hover:bg-muted/80 ${sortCol === "preco" ? "text-primary" : ""}`}
                    onClick={() => toggleSort("preco")}
                  >
                    Preço{sortCol === "preco" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th
                    className={`px-4 py-4 font-medium text-right cursor-pointer select-none hover:bg-muted/80 ${sortCol === "estoque" ? "text-primary" : ""}`}
                    onClick={() => toggleSort("estoque")}
                  >
                    Estoque{sortCol === "estoque" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th
                    className={`px-4 py-4 font-medium cursor-pointer select-none hover:bg-muted/80 ${sortCol === "validade" ? "text-primary" : ""}`}
                    onClick={() => toggleSort("validade")}
                  >
                    Validade{sortCol === "validade" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th
                    className={`px-4 py-4 font-medium cursor-pointer select-none hover:bg-muted/80 ${sortCol === "criado_em" ? "text-primary" : ""}`}
                    onClick={() => toggleSort("criado_em")}
                  >
                    Cadastro{sortCol === "criado_em" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th
                    className="px-4 py-4 font-medium text-center cursor-pointer select-none hover:bg-muted/80"
                    onClick={() => {
                      setSortCol(null);
                      setSortDir("asc");
                    }}
                    title="Limpar ordenação"
                  >
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {produtosOrdenados.map(p => {
                  const vs = validadeStatus(p.validade);
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-4 text-muted-foreground font-mono text-sm">{p.codigo || '-'}</td>
                      <td className="px-4 py-4 font-bold">{p.nome}</td>
                      <td className="px-4 py-4 text-muted-foreground">{p.marca || '-'}</td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                          p.categoria === "cozinha"
                            ? "bg-orange-100 text-orange-700"
                            : p.categoria === "feira"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-primary/10 text-primary"
                        }`}>
                          {p.categoria}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-bold text-primary">{formatMoney(p.preco)}</td>
                      <td className={`px-4 py-4 text-right font-mono font-medium ${p.estoque <= p.estoque_min ? 'text-destructive font-bold' : ''}`}>
                        {p.estoque} <span className="text-xs text-muted-foreground">{p.unidade}</span>
                      </td>
                      <td className="px-4 py-4">
                        {p.validade ? (
                          <span className={`flex items-center gap-1 text-sm font-medium ${
                            vs === 'vencido' ? 'text-destructive' : vs === 'vencendo' ? 'text-yellow-600' : 'text-muted-foreground'
                          }`}>
                            <Calendar className="w-4 h-4" />
                            {formatValidade(p.validade)}
                            {vs === 'vencido' && <span className="text-xs font-bold bg-destructive/10 px-1 rounded">VENCIDO</span>}
                            {vs === 'vencendo' && <span className="text-xs font-bold bg-yellow-100 px-1 rounded">VENCENDO</span>}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        {p.criado_em ? new Date(p.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                      </td>
                      <td className="px-4 py-4">
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
                  );
                })}
                {produtosOrdenados.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                      Nenhum produto encontrado. Clique em "Novo Produto" para adicionar.
                    </td>
                  </tr>
                )}
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

          {/* Campo de Código de Barras com Botão Scanner */}
          <div>
            <label className="block text-sm font-medium mb-2">Código de Barras</label>
            <CodigoBarrasInput
              value={formData.codigo}
              onChange={v => setFormData({...formData, codigo: v})}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Categoria *</label>
            <Select required value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value as CriarProdutoInputCategoria})}>
              <option value="mercado">Mercado</option>
              <option value="cozinha">Cozinha / Lanchonete</option>
              <option value="feira">Feira (peso)</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">NCM</label>
              <Input value={formData.ncm} onChange={e => setFormData({...formData, ncm: e.target.value})} placeholder="Ex: 22011000" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">CST / CSOSN</label>
              <Input value={formData.cst} onChange={e => setFormData({...formData, cst: e.target.value})} placeholder="Ex: 060 ou 102" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">CFOP</label>
              <Input value={(formData as any).cfop} onChange={e => setFormData({...formData, cfop: e.target.value} as any)} placeholder="Ex: 5102" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">CEST</label>
              <Input value={(formData as any).cest} onChange={e => setFormData({...formData, cest: e.target.value} as any)} placeholder="Ex: 1234567" />
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
              <Input type="number" step="0.01" value={formData.estoque} onChange={e => setFormData({...formData, estoque: e.target.value})} />
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
          <div>
            <label className="block text-sm font-medium mb-1 flex items-center gap-1">
              <Calendar className="w-4 h-4" /> Validade <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <Input
              type="date"
              value={formData.validade}
              onChange={e => setFormData({...formData, validade: e.target.value})}
            />
          </div>
          <div className="pt-6 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={criar.isPending || editar.isPending}>
              {editingId ? "Salvar Alterações" : "Criar Produto"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} title="Importar produtos por NF-e (XML)">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Cole o conteúdo do XML da NF-e ou envie o arquivo. O importador cria novos produtos e atualiza estoque/custo quando o código de barras já existir.
          </p>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Arquivo XML</label>
            <Input
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setXmlRaw(text);
                setXmlPreview(null);
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Conteúdo XML</label>
            <textarea
              value={xmlRaw}
              onChange={(e) => {
                setXmlRaw(e.target.value);
                setXmlPreview(null);
              }}
              className="w-full min-h-40 rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
              placeholder="<nfeProc>...</nfeProc>"
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={parseXmlPreview} disabled={!xmlRaw.trim()}>
              Ler XML
            </Button>
          </div>

          {xmlPreview && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-secondary/30 p-3 text-sm">
                <p><strong>Emitente:</strong> {xmlPreview.emitente || "-"}</p>
                <p><strong>Chave:</strong> {xmlPreview.chaveNfe || "-"}</p>
                <p><strong>Itens:</strong> {xmlPreview.itens.length}</p>
              </div>
              <div className="max-h-56 overflow-auto rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2">Descrição</th>
                      <th className="px-3 py-2">Cód. barras</th>
                      <th className="px-3 py-2">NCM</th>
                      <th className="px-3 py-2">CST/CSOSN</th>
                      <th className="px-3 py-2 text-right">Qtd</th>
                      <th className="px-3 py-2 text-right">V. un.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {xmlPreview.itens.slice(0, 100).map((item, idx) => (
                      <tr key={`${item.codigoInterno}-${idx}`}>
                        <td className="px-3 py-2">{item.descricao}</td>
                        <td className="px-3 py-2 font-mono">{item.codigoBarras || "-"}</td>
                        <td className="px-3 py-2">{item.ncm || "-"}</td>
                        <td className="px-3 py-2">{item.cst || "-"}</td>
                        <td className="px-3 py-2 text-right font-mono">{item.quantidade}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatMoney(item.valorUnitario)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {xmlPreview.itens.length > 100 && (
                <p className="text-xs text-muted-foreground">
                  Mostrando 100 itens na prévia de um total de {xmlPreview.itens.length}.
                </p>
              )}
            </div>
          )}

          <div className="pt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setImportModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleImportarXml} disabled={!xmlPreview || importingXml}>
              {importingXml ? "Importando..." : "Importar itens"}
            </Button>
          </div>
        </div>
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
