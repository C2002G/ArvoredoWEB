import { useState } from "react";
import { Modal, Button, Input } from "@/components/ui-elements";
import { useOperador, type Operador } from "@/store/use-operador";

const CORES_DISPONIVEIS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

export function OperadorBubble() {
  const { operador, setOperador } = useOperador();
  const [modalOpen, setModalOpen] = useState(false);
  const [modo, setModo] = useState<"login" | "criar">("login");
  const [usuarioInput, setUsuarioInput] = useState("");
  const [senhaInput, setSenhaInput] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [novoNome, setNovoNome] = useState("");
  const [novoSobrenome, setNovoSobrenome] = useState("");
  const [novoUsuario, setNovoUsuario] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novaSenhaConfirm, setNovaSenhaConfirm] = useState("");
  const [novaCor, setNovaCor] = useState(CORES_DISPONIVEIS[5]);

  const resetForm = () => {
  setUsuarioInput(""); setSenhaInput(""); setErro(null); setModo("login");
  setNovoNome(""); setNovoSobrenome(""); setNovoUsuario(""); setNovaSenha(""); setNovaSenhaConfirm(""); // NOVO
  };

  const handleLogin = async () => {
    setErro(null); setLoading(true);
    try {
      const res = await fetch("/api/usuarios/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usuarioInput.trim(), senha: senhaInput }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErro(data.message || "Usuario ou senha invalidos"); return; }
      setOperador(data.usuario as Operador);
      setModalOpen(false); resetForm();
    } catch {
      setErro("Erro de conexao com o servidor");
    } finally { setLoading(false); }
  };

  const handleCriar = async () => {
    if (novaSenha !== novaSenhaConfirm) {
        setErro("As senhas não coincidem");
        return;
    }
    setErro(null); setLoading(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: novoNome.trim(), sobrenome: novoSobrenome.trim() || undefined,
          usuario: novoUsuario.trim(), senha: novaSenha, cor: novaCor,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.message || "Erro ao criar operador"); return; }
      setOperador({ ...data, iniciais: data.iniciais } as Operador);
      setModalOpen(false); resetForm();
    } catch {
      setErro("Erro de conexao com o servidor");
    } finally { setLoading(false); }
  };

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        title={operador ? `${operador.nome} ${operador.sobrenome ?? ""}`.trim() : "Entrar"}
        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 border-2 border-white/40 shadow-sm hover:scale-105 transition-transform"
        style={{ backgroundColor: operador?.cor ?? "#94a3b8" }}
      >
        {operador ? operador.iniciais : "?"}
      </button>

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title={modo === "login" ? "Identificar operador" : "Novo operador"}>
        <div className="space-y-4">
          {operador && modo === "login" && (
            <div className="flex items-center gap-2 bg-secondary/40 rounded-lg px-3 py-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: operador.cor }}>
                {operador.iniciais}
              </div>
              <p className="text-sm">Logado como <strong>{operador.nome}</strong>. Entre com outro usuario pra trocar.</p>
            </div>
          )}

          {modo === "login" ? (
            <>
              <Input placeholder="Usuario" value={usuarioInput} onChange={(e) => setUsuarioInput(e.target.value)} />
              <Input type="password" placeholder="Senha" value={senhaInput}
                onChange={(e) => setSenhaInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
              {erro && <p className="text-sm text-destructive">{erro}</p>}
              <Button onClick={handleLogin} disabled={loading || !usuarioInput || !senhaInput} className="w-full">
                {loading ? "Entrando..." : "Entrar"}
              </Button>
              <button onClick={() => setModo("criar")} className="text-xs text-muted-foreground hover:text-foreground underline w-full text-center">
                Criar novo operador
              </button>
            </>
          ) : (
            <>
              <Input placeholder="Nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
              <Input placeholder="Sobrenome (opcional)" value={novoSobrenome} onChange={(e) => setNovoSobrenome(e.target.value)} />
              <Input placeholder="Usuario (login)" value={novoUsuario} onChange={(e) => setNovoUsuario(e.target.value)} />
              <Input type="password" placeholder="Senha" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
              <Input type="password" placeholder="Confirmar senha" value={novaSenhaConfirm} onChange={(e) => setNovaSenhaConfirm(e.target.value)} />
              <div className="flex gap-2 flex-wrap">
                {CORES_DISPONIVEIS.map((cor) => (
                  <button key={cor} onClick={() => setNovaCor(cor)}
                    className={`w-7 h-7 rounded-full border-2 ${novaCor === cor ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: cor }} />
                ))}
              </div>
              {erro && <p className="text-sm text-destructive">{erro}</p>}
              <Button onClick={handleCriar} disabled={loading || !novoNome || !novoUsuario || !novaSenha || novaSenha !== novaSenhaConfirm} className="w-full">                {loading ? "Criando..." : "Criar e entrar"}
              </Button>
              <button onClick={() => setModo("login")} className="text-xs text-muted-foreground hover:text-foreground underline w-full text-center">
                Voltar para login
              </button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}