"use client";

/**
 * ChatBubble — bolha flutuante no canto que abre painel de chamados.
 * Usada no /painel/suporte se empresa tem acesso liberado.
 */
import { useEffect, useState, useCallback } from "react";
import { MessageCircle, X, Send, Inbox, Plus, Clock } from "lucide-react";

interface Chamado {
  id: string; assunto: string; status: string; ultima_msg_em: string;
  msgs_nao_lidas: string;
}

interface Horarios {
  online_agora: boolean;
  mensagem_offline: string;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function ChatBubble() {
  const [open, setOpen]         = useState(false);
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [horarios, setHorarios] = useState<Horarios | null>(null);
  const [novo, setNovo]         = useState(false);
  const [assunto, setAssunto]   = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      fetch("/api/painel/suporte/chamados",  { headers: authHeaders(), cache: "no-store" }),
      fetch("/api/painel/suporte/horarios",  { headers: authHeaders(), cache: "no-store" }),
    ]);
    const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
    if (d1.success) setChamados(d1.data.chamados ?? []);
    if (d2.success) setHorarios({
      online_agora: !!d2.data.online_agora,
      mensagem_offline: d2.data.mensagem_offline ?? "Estamos fora do horário",
    });
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 15_000);
    return () => clearInterval(t);
  }, [carregar]);

  async function abrirChamado() {
    if (assunto.length < 3 || mensagem.length < 3) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/painel/suporte/chamados", {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ assunto, mensagem, prioridade: "normal", canal: "chat" }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setNovo(false); setAssunto(""); setMensagem("");
        carregar();
      }
    } finally { setEnviando(false); }
  }

  const naoLidas = chamados.reduce((sum, c) => sum + parseInt(c.msgs_nao_lidas || "0"), 0);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-900/40 hover:bg-emerald-600 transition">
        <MessageCircle className="h-6 w-6 text-white" />
        {naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {naoLidas}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[360px] max-w-[calc(100vw-2rem)] max-h-[600px] flex flex-col rounded-2xl border border-emerald-500/30 bg-slate-900 shadow-2xl">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-emerald-400" />
          <span className="font-bold text-white text-sm">Suporte</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            horarios?.online_agora ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-400"
          }`}>
            {horarios?.online_agora ? "● online" : "○ offline"}
          </span>
        </div>
        <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </header>

      {!horarios?.online_agora && !novo && (
        <div className="m-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-200">
          {horarios?.mensagem_offline}
        </div>
      )}

      {novo ? (
        <div className="flex-1 overflow-auto p-3">
          <h3 className="text-sm font-semibold text-white mb-2">Novo chamado</h3>
          <input value={assunto} onChange={e => setAssunto(e.target.value)}
            placeholder="Assunto"
            className="mb-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
          <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={5}
            placeholder="Descreva o problema..."
            className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setNovo(false)}
              className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
              Cancelar
            </button>
            <button onClick={abrirChamado} disabled={enviando || assunto.length < 3 || mensagem.length < 3}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
              <Send className="h-3 w-3" /> Enviar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {chamados.length === 0 ? (
              <div className="text-center py-8">
                <Inbox className="h-10 w-10 text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-500">Nenhum chamado ainda</p>
              </div>
            ) : chamados.map(c => {
              const naoLido = parseInt(c.msgs_nao_lidas || "0");
              return (
                <a key={c.id} href={`/painel/suporte/chamados/${c.id}`}
                  className="block rounded-lg border border-white/10 bg-slate-950 px-3 py-2 hover:bg-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                      c.status === "aberto"             ? "bg-emerald-500/20 text-emerald-300" :
                      c.status === "em_andamento"       ? "bg-blue-500/20 text-blue-300" :
                      c.status === "aguardando_cliente" ? "bg-amber-500/20 text-amber-300" :
                                                          "bg-slate-700 text-slate-400"
                    }`}>{c.status.replace("_"," ")}</span>
                    {naoLido > 0 && (
                      <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{naoLido}</span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-white line-clamp-1">{c.assunto}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(c.ultima_msg_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </a>
              );
            })}
          </div>
          <div className="border-t border-white/10 p-3">
            <button onClick={() => setNovo(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-600">
              <Plus className="h-4 w-4" /> Novo chamado
            </button>
          </div>
        </>
      )}
    </div>
  );
}
