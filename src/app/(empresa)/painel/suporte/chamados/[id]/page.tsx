"use client";

/**
 * /painel/suporte/chamados/[id] — Conversa do chamado.
 * Funciona pra master (vê todos) e empresa (vê só o seu).
 * Polling 5s. Editor de mensagem fixo no rodapé.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Send, Loader2, AlertCircle, Lock, Clock } from "lucide-react";

interface Mensagem {
  id: string;
  autor_id: string | null;
  autor_tipo: "cliente" | "agente" | "sistema";
  autor_nome: string;
  texto: string;
  interno: boolean;
  criado_em: string;
}

interface Chamado {
  id:           string;
  assunto:      string;
  status:       string;
  prioridade:   string;
  empresa_nome: string;
  criado_em:    string;
  fechado_em:   string | null;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function formatHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ChamadoPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const [chamado, setChamado]     = useState<Chamado | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [erro, setErro]           = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [texto, setTexto]         = useState("");
  const [enviando, setEnviando]   = useState(false);
  const [interno, setInterno]     = useState(false);
  const [isMaster, setIsMaster]   = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Detecta role
  useEffect(() => {
    fetch("/api/auth/me", { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setIsMaster(d?.data?.usuario?.role === "master"))
      .catch(() => {});
  }, []);

  async function carregar() {
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}`, {
        headers: authHeaders(), cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setErro(d?.error ?? "Erro ao carregar");
        setLoading(false);
        return;
      }
      setChamado(d.data.chamado);
      setMensagens(d.data.mensagens ?? []);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 5_000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  // Auto-scroll pra última mensagem
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mensagens.length]);

  async function enviar() {
    if (texto.trim().length < 1) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}/mensagens`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ texto, interno }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      setTexto("");
      setInterno(false);
      carregar();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
    } finally { setEnviando(false); }
  }

  async function alterarStatus(novoStatus: string) {
    if (!confirm(`Alterar status para "${novoStatus}"?`)) return;
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}`, {
        method:  "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ status: novoStatus }),
      });
      if (r.ok) carregar();
    } catch {/* */}
  }

  if (loading) {
    return <div className="flex h-96 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
    </div>;
  }

  if (erro || !chamado) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mb-3" />
        <h1 className="text-lg font-bold text-white">{erro ?? "Chamado não encontrado"}</h1>
        <button onClick={() => router.push("/painel/suporte")}
          className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
          Voltar
        </button>
      </div>
    );
  }

  const podeEnviar = chamado.status !== "fechado";

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] -m-6 md:-m-8">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900 px-6 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded p-1 text-slate-400 hover:bg-white/5">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-white truncate">{chamado.assunto}</h1>
          <p className="text-[10px] text-slate-500">
            {chamado.empresa_nome} · #{chamado.id.slice(0, 8)} · aberto {formatHora(chamado.criado_em)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
            chamado.status === "aberto"             ? "bg-emerald-500/20 text-emerald-300" :
            chamado.status === "em_andamento"       ? "bg-blue-500/20 text-blue-300" :
            chamado.status === "aguardando_cliente" ? "bg-amber-500/20 text-amber-300" :
            chamado.status === "resolvido"          ? "bg-purple-500/20 text-purple-300" :
                                                      "bg-slate-700 text-slate-400"
          }`}>{chamado.status.replace("_", " ")}</span>
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
            chamado.prioridade === "urgente" ? "bg-red-500/20 text-red-300" :
            chamado.prioridade === "alta"    ? "bg-amber-500/20 text-amber-300" :
                                              "bg-slate-700 text-slate-400"
          }`}>{chamado.prioridade}</span>
        </div>
      </header>

      {/* Master tem botões de status */}
      {isMaster && podeEnviar && (
        <div className="border-b border-white/10 bg-slate-950/50 px-6 py-2 flex items-center gap-2 text-xs">
          <span className="text-slate-500">Mudar status:</span>
          {["em_andamento", "aguardando_cliente", "resolvido", "fechado"].map(s =>
            chamado.status !== s && (
              <button key={s} onClick={() => alterarStatus(s)}
                className="rounded border border-white/10 px-2 py-0.5 text-slate-300 hover:bg-white/5">
                {s.replace("_", " ")}
              </button>
            )
          )}
        </div>
      )}

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6 space-y-3 bg-slate-950">
        {mensagens.map(m => {
          const isMe   = isMaster ? m.autor_tipo === "agente" : m.autor_tipo === "cliente";
          const isSys  = m.autor_tipo === "sistema";
          if (isSys) {
            return (
              <div key={m.id} className="text-center text-[10px] text-slate-600">
                — {m.texto} ({formatHora(m.criado_em)}) —
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                m.interno ? "bg-amber-500/10 border border-amber-500/30 text-amber-200" :
                isMe      ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-100" :
                            "bg-slate-800 border border-white/10 text-slate-200"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                    {m.autor_nome}
                  </p>
                  {m.interno && (
                    <span className="text-[9px] flex items-center gap-1 text-amber-300">
                      <Lock className="h-2.5 w-2.5" /> nota interna
                    </span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.texto}</p>
                <p className="mt-1 text-[10px] opacity-50 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> {formatHora(m.criado_em)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      {podeEnviar ? (
        <div className="border-t border-white/10 bg-slate-900 p-3">
          {isMaster && (
            <label className="mb-2 flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400">
              <input type="checkbox" checked={interno} onChange={e => setInterno(e.target.checked)}
                className="h-3.5 w-3.5 accent-amber-500" />
              <Lock className="h-3 w-3" /> Nota interna (cliente não vê)
            </label>
          )}
          <div className="flex gap-2">
            <textarea
              value={texto} onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(); }}
              placeholder={interno ? "Nota interna (Ctrl+Enter envia)" : "Digite sua mensagem (Ctrl+Enter envia)"}
              rows={2}
              className={`flex-1 resize-none rounded-lg border px-3 py-2 text-sm text-white focus:outline-none ${
                interno ? "border-amber-500/30 bg-amber-500/5" : "border-white/10 bg-slate-950"
              }`}
            />
            <button onClick={enviar} disabled={enviando || texto.trim().length < 1}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
                interno ? "bg-amber-500 hover:bg-amber-600 text-slate-950" : "bg-emerald-500 hover:bg-emerald-600"
              }`}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-white/10 bg-slate-950 p-4 text-center">
          <p className="text-xs text-slate-500">Chamado fechado. Abra um novo se precisar.</p>
        </div>
      )}
    </div>
  );
}
