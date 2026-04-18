import React, { useEffect, useState } from "react";
import { useTestarImpressora } from "@/hooks/use-impressora";
import { useMaquininhaConfig, useSalvarMaquininhaConfig, useTestarMaquininha } from "@/hooks/use-maquininha";
import { Button } from "@/components/ui-elements";
import { Printer, ScanBarcode, CheckCircle2, XCircle, AlertCircle, Wifi, Loader2, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type StatusImpressora = "idle" | "testando" | "ok" | "erro";

function StatusBadge({ status, erro }: { status: StatusImpressora; erro?: string }) {
  if (status === "idle") return (
    <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
      <AlertCircle className="w-4 h-4" /> Não testado
    </span>
  );
  if (status === "testando") return (
    <span className="flex items-center gap-1.5 text-blue-600 text-sm animate-pulse">
      <Loader2 className="w-4 h-4 animate-spin" /> Testando...
    </span>
  );
  if (status === "ok") return (
    <span className="flex items-center gap-1.5 text-green-600 text-sm font-semibold">
      <CheckCircle2 className="w-4 h-4" /> Conectada e funcionando
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-destructive text-sm">
      <XCircle className="w-4 h-4" /> {erro || "Não encontrada"}
    </span>
  );
}

export default function Dispositivos() {
  const testarImpressora = useTestarImpressora();
  const configMaquininha = useMaquininhaConfig();
  const salvarMaquininha = useSalvarMaquininhaConfig();
  const testarMaquininha = useTestarMaquininha();
  const { toast } = useToast();
  const [statusImpressora, setStatusImpressora] = useState<StatusImpressora>("idle");
  const [erroImpressora, setErroImpressora] = useState<string>("");
  const [formMaquininha, setFormMaquininha] = useState({
    ativo: true,
    modo_conexao: "manual" as "manual" | "api" | "usb_bridge",
    api_url: "",
    api_token: "",
    timeout_ms: 8000,
    empresa_nome: "NOME DA EMPRESA",
    empresa_cnpj: "00.000.000/0000-00",
    empresa_regra_padrao:
      "Venda presencial. Confirmar manualmente no PDV apos aprovacao na maquininha.",
  });

  useEffect(() => {
    if (configMaquininha.data) {
      setFormMaquininha(configMaquininha.data);
    }
  }, [configMaquininha.data]);

  const handleTestarImpressora = () => {
    setStatusImpressora("testando");
    setErroImpressora("");
    testarImpressora.mutate(undefined, {
      onSuccess: (res: any) => {
        if (res?.ok) {
          setStatusImpressora("ok");
          toast({ title: "Impressora OK", description: "Página de teste enviada com sucesso.", className: "bg-green-600 text-white" });
        } else {
          setStatusImpressora("erro");
          setErroImpressora(res?.erro || "Impressora não respondeu");
        }
      },
      onError: () => {
        setStatusImpressora("erro");
        setErroImpressora("Erro de comunicação com o servidor");
      }
    });
  };

  const handleSalvarMaquininha = () => {
    salvarMaquininha.mutate(formMaquininha, {
      onSuccess: () => {
        toast({
          title: "Maquininha salva",
          description: "Configuracao gravada com sucesso.",
          className: "bg-green-600 text-white",
        });
        configMaquininha.refetch();
      },
      onError: (err: unknown) => {
        toast({
          title: "Erro ao salvar maquininha",
          description: err instanceof Error ? err.message : "Falha ao salvar configuracao",
          variant: "destructive",
        });
      },
    });
  };

  const handleTestarMaquininha = () => {
    testarMaquininha.mutate(undefined, {
      onSuccess: (res) => {
        toast({
          title: "Teste da maquininha",
          description: res?.mensagem || "Teste executado",
          className: "bg-blue-600 text-white",
        });
      },
      onError: (err: unknown) => {
        toast({
          title: "Erro no teste",
          description: err instanceof Error ? err.message : "Falha ao testar",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="p-6 md:p-8 h-full overflow-y-auto max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Dispositivos</h1>
        <p className="text-muted-foreground mt-1">Gerencie e teste os dispositivos do ponto de venda</p>
      </div>

      <div className="grid gap-6">
        {/* Impressora Térmica */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 p-3 rounded-xl flex-shrink-0">
              <Printer className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">Impressora Térmica</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">Elgin I9 — USB (VID: 0483 / PID: 5743)</p>
                </div>
                <StatusBadge status={statusImpressora} erro={erroImpressora} />
              </div>

              <div className="mt-4 bg-muted/50 rounded-xl p-4 text-sm space-y-1.5 text-muted-foreground font-mono">
                <p>Modelo: <span className="text-foreground font-semibold">Elgin I9</span></p>
                <p>Interface: <span className="text-foreground font-semibold">USB (ESC/POS)</span></p>
                <p>CNPJ impresso: <span className="text-foreground font-semibold">60.242.783/0001-41</span></p>
                <p>Papel: <span className="text-foreground font-semibold">80mm — 32 colunas</span></p>
              </div>

              {statusImpressora === "erro" && (
                <div className="mt-4 bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-sm text-destructive">
                  <strong>Erro:</strong> {erroImpressora}
                  <br />
                  <span className="text-xs mt-1 block">
                    Verifique se a impressora está ligada e conectada via USB antes de testar.
                  </span>
                </div>
              )}

              {statusImpressora === "ok" && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">
                  Página de teste enviada. Verifique se o papel foi impresso corretamente.
                </div>
              )}

              <div className="mt-5 flex gap-3">
                <Button
                  onClick={handleTestarImpressora}
                  disabled={statusImpressora === "testando"}
                  className="gap-2"
                >
                  {statusImpressora === "testando" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  {statusImpressora === "testando" ? "Testando..." : "Testar Impressão"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Maquininha de Cartao */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="bg-emerald-100 p-3 rounded-xl flex-shrink-0">
              <CreditCard className="w-7 h-7 text-emerald-600" />
            </div>
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">Maquininha de Cartao</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">
                    Integracao generica (sem marca fixa): debito, credito e PIX
                  </p>
                </div>
                <span className="text-xs px-3 py-1 rounded-full border border-border bg-secondary/50 text-muted-foreground">
                  {configMaquininha.isLoading ? "Carregando..." : `Modo: ${formMaquininha.modo_conexao}`}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-muted-foreground mb-1">Ativar integração</span>
                  <select
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={formMaquininha.ativo ? "sim" : "nao"}
                    onChange={(e) => setFormMaquininha(prev => ({ ...prev, ativo: e.target.value === "sim" }))}
                  >
                    <option value="sim">Sim</option>
                    <option value="nao">Nao</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="block text-muted-foreground mb-1">Modo de conexão</span>
                  <select
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={formMaquininha.modo_conexao}
                    onChange={(e) =>
                      setFormMaquininha(prev => ({
                        ...prev,
                        modo_conexao: e.target.value as "manual" | "api" | "usb_bridge",
                      }))
                    }
                  >
                    <option value="manual">Manual (sem integração direta)</option>
                    <option value="api">API/Gateway</option>
                    <option value="usb_bridge">USB com bridge local</option>
                  </select>
                </label>

                <label className="text-sm md:col-span-2">
                  <span className="block text-muted-foreground mb-1">URL da API/Gateway da maquininha</span>
                  <input
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    placeholder="http://localhost:4005/tef/pagar"
                    value={formMaquininha.api_url}
                    onChange={(e) => setFormMaquininha(prev => ({ ...prev, api_url: e.target.value }))}
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-muted-foreground mb-1">Token (opcional)</span>
                  <input
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Bearer token"
                    value={formMaquininha.api_token}
                    onChange={(e) => setFormMaquininha(prev => ({ ...prev, api_token: e.target.value }))}
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-muted-foreground mb-1">Timeout (ms)</span>
                  <input
                    type="number"
                    min={1500}
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={formMaquininha.timeout_ms}
                    onChange={(e) =>
                      setFormMaquininha(prev => ({ ...prev, timeout_ms: Number(e.target.value || 8000) }))
                    }
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-muted-foreground mb-1">Nome da empresa</span>
                  <input
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={formMaquininha.empresa_nome}
                    onChange={(e) => setFormMaquininha(prev => ({ ...prev, empresa_nome: e.target.value }))}
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-muted-foreground mb-1">CNPJ da empresa</span>
                  <input
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={formMaquininha.empresa_cnpj}
                    onChange={(e) => setFormMaquininha(prev => ({ ...prev, empresa_cnpj: e.target.value }))}
                  />
                </label>

                <label className="text-sm md:col-span-2">
                  <span className="block text-muted-foreground mb-1">Regra padrão da empresa</span>
                  <input
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={formMaquininha.empresa_regra_padrao}
                    onChange={(e) =>
                      setFormMaquininha(prev => ({ ...prev, empresa_regra_padrao: e.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
                No PDV, ao escolher <strong>Debito</strong>, <strong>Credito</strong> ou <strong>PIX</strong>,
                o sistema envia automaticamente valor e itens para esta integracao.
                A confirmacao final da venda continua manual, conforme sua regra atual.
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  onClick={handleSalvarMaquininha}
                  disabled={salvarMaquininha.isPending}
                  className="gap-2"
                >
                  {salvarMaquininha.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Salvar configuração
                </Button>

                <Button
                  variant="outline"
                  onClick={handleTestarMaquininha}
                  disabled={testarMaquininha.isPending}
                  className="gap-2"
                >
                  {testarMaquininha.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Testar conexão
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Leitor de Código de Barras */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="bg-orange-100 p-3 rounded-xl flex-shrink-0">
              <ScanBarcode className="w-7 h-7 text-orange-600" />
            </div>
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">Leitor de Código de Barras</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">USB HID — funciona como teclado automático</p>
                </div>
                <span className="flex items-center gap-1.5 text-green-600 text-sm font-semibold">
                  <Wifi className="w-4 h-4" /> Plug &amp; Play
                </span>
              </div>

              <div className="mt-4 bg-muted/50 rounded-xl p-4 text-sm space-y-1.5 text-muted-foreground font-mono">
                <p>Interface: <span className="text-foreground font-semibold">USB HID (teclado)</span></p>
                <p>Configuração: <span className="text-foreground font-semibold">Nenhuma necessária</span></p>
                <p>Sufixo: <span className="text-foreground font-semibold">Enter (automático)</span></p>
              </div>

              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
                <p className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Como usar o leitor no sistema:
                </p>
                <ul className="ml-5 space-y-1 list-disc text-blue-700">
                  <li>No <strong>PDV</strong>: aponte o leitor para qualquer produto — ele será buscado e adicionado ao carrinho automaticamente</li>
                  <li>Em <strong>Cadastrar Produto</strong>: clique em "Escanear" no campo de código e aponte o leitor</li>
                  <li>O leitor envia o código + Enter, o sistema captura e processa</li>
                </ul>
              </div>

              <div className="mt-5">
                <BarcodeTester />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Mini-teste do leitor: campo de texto que detecta leitura rápida */
function BarcodeTester() {
  const [testCode, setTestCode] = useState("");
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTest = () => {
    setTesting(true);
    setTestCode("");
    setLastRead(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTestCode(e.target.value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (e.target.value.length > 3) {
        setLastRead(e.target.value);
        setTesting(false);
        setTestCode("");
      }
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && testCode.length > 3) {
      setLastRead(testCode);
      setTesting(false);
      setTestCode("");
    }
  };

  return (
    <div className="border border-dashed border-border rounded-xl p-4">
      <p className="text-sm font-semibold mb-3 text-muted-foreground">Testar leitor de código de barras:</p>
      {testing ? (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 animate-pulse flex items-center gap-3">
          <ScanBarcode className="w-5 h-5 text-orange-600 animate-bounce" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-700">Aponte o leitor para qualquer código de barras...</p>
            <input
              ref={inputRef}
              type="text"
              value={testCode}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              className="w-full mt-1 bg-transparent border-none outline-none font-mono text-orange-800"
              placeholder="aguardando leitura..."
              autoComplete="off"
            />
          </div>
          <button onClick={() => setTesting(false)} className="text-orange-400 hover:text-orange-700 text-xs">cancelar</button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={startTest} className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50">
            <ScanBarcode className="w-4 h-4" />
            Escanear código de teste
          </Button>
          {lastRead && (
            <span className="text-sm text-green-700 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Lido: <span className="font-mono font-bold">{lastRead}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
