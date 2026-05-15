"use client";

/**
 * /painel/suporte — Meus chamados
 *
 * Lista chamados abertos pelo usuário logado (qualquer role).
 * Master/suporte veem TODOS chamados (cross-tenant).
 * Empresa: vê chamados da própria empresa.
 *
 * Não exige chave de suporte (chave continua só pra Centro de Ajuda).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, Plus, MessageCircle, Clock, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

interface Chamado {
  id:           string;
  assunto:      string;
  prioridade:   string;
  status:       string;
  empresa_nome: string;
  criado_em:    string;
  ultima_msg_em: string;
  msgs_nao_lidas: string;
  atribuido_nome: string | null;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function tempoAtras(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "agora";
  const m = Math.floor(ms / 60000); if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const STATUS_META: Record<string, { label: string; cor: string }> = {
  aberto:             { label: "Aberto",            cor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  em_andamento:       { label: "Em andamento",       cor: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  aguardando_cliente: { label: "Aguardando você",    cor: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  resolvido:          { label: "Resolvido",          cor: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  fechado:            { label: "Fechado",            cor: "bg-slate-700 text-slate-400 border-white/10" },
};

const PRIORIDADE_META: Record<string, string> = {
  urgente: "bg-red-500/15 text-red-300",
  alta:    "bg-amber-500/15 text-amber-300",
  normal:  "bg-slate-700 text-slate-300",
  baixa:   "bg-slate-700/50 text-slate-400",
};

export default function MeusChamadosPage() {
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filtroStatus, setFiltro] = useState<string>("ativos");

  // Modal abrir novo
  const [modal, setModal]       = useState(false);
  const [assunto, setAssunto]   = useState("");
  const [mensagem, setMensagem] = useState("");
  const [prioridade, setPrioridade] = useState("normal");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro]         = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch("/api/painel/suporte/chamados", { headers: authHeaders(), cache: "no-store" });
      const d = await r.json();
      if (d.success) setChamados(d.data.chamados ?? []);
    } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function abrirChamado() {
    if (assunto.length < 3 || mensagem.length < 3) {
      setErro("Assunto e mensagem precisam de pelo menos 3 chars");
      return;
    }
    setEnviando(true); setErro(null);
    try {
      const r = await fetch("/api/painel/suporte/chamados", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ assunto, mensagem, prioridade, canal: "chat" }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      setModal(false);
      setAssunto(""); setMensagem(""); setPrioridade("normal");
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally { setEnviando(false); }
  }

  const chamadosFiltrados = chamados.filter(c => {
    if (filtroStatus === "ativos") return c.status !== "fechado" && c.status !== "resolvido";
    if (filtroStatus === "todos")  return true;
    return c.status === filtroStatus;
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <MessageCircle className="h-5 w-5 text-emerald-400" /> Meus chamados
          </h1>
          <p className="text-sm text-slate-400">Solicitações de suporte abertas e seu histórico</p>
        </div>
        <button onClick={() => { setModal(true); setErro(null); }}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600">
          <Plus className="h-4 w-4" /> Abrir chamado
        </button>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { v: "ativos",       lbl: "Ativos" },
          { v: "aberto",       lbl: "Abertos" },
          { v: "em_andamento", lbl: "Em andamento" },
          { v: "aguardando_cliente", lbl: "Aguardando" },
          { v: "resolvido",    lbl: "Resolvidos" },
          { v: "fechado",      lbl: "Fechados" },
          { v: "todos",        lbl: "Todos" },
        ].map(f => (
          <button key={f.v} onClick={() => setFiltro(f.v)}
            className={`rounded-full px-3 py-1 text-xs ${
              filtroStatus === f.v
                ? "bg-emerald-500 text-white"
                : "border border-white/10 text-slate-400 hover:bg-white/5"
            }`}>
            {f.lbl}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400 mx-auto" />
          </div>
        ) : chamadosFiltrados.length === 0 ? (
          <div className="py-16 text-center">
            <Inbox className="h-12 w-12 text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-400">Nenhum chamado</p>
            <p className="text-xs text-slate-600 mt-1">
              {filtroStatus === "ativos" ? "Tudo resolvido por aqui!" : "Nenhum chamado nesse filtro"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {chamadosFiltrados.map(c => {
              const status = STATUS_META[c.status] ?? STATUS_META.aberto;
              const prio   = PRIORIDADE_META[c.prioridade] ?? PRIORIDADE_META.normal;
              const naoLidas = parseInt(c.msgs_nao_lidas || "0");
              const isResolvido = c.status === "resolvido" || c.status === "fechado";
              return (
                <Link key={c.id} href={`/painel/suporte/chamados/${c.id}`}
                  className="block px-4 py-3 hover:bg-white/[.03] transition">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-lg p-2 flex-shrink-0 ${
                      isResolvido ? "bg-emerald-500/10" : c.prioridade === "urgente" ? "bg-red-500/10" : "bg-blue-500/10"
                    }`}>
                      {isResolvido
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        : <MessageCircle className="h-4 w-4 text-blue-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-white truncate">{c.assunto}</p>
                        <span className={`text-[10px] uppercase font-bold rounded border px-1.5 py-0.5 ${status.cor}`}>
                          {status.label}
                        </span>
                        <span className={`text-[10px] uppercase font-bold rounded px-1.5 py-0.5 ${prio}`}>
                          {c.prioridade}
                        </span>
                        {naoLidas > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-2">
                            {naoLidas} nova{naoLidas > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        {c.empresa_nome && <span>🏢 {c.empresa_nome}</span>}
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> aberto {tempoAtras(c.criado_em)} atrás</span>
                        {c.atribuido_nome && <span>· atendido por {c.atribuido_nome}</span>}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-500 text-center">
        Procurando passo-a-passo de instalação? Vai em <Link href="/painel/ajuda" className="text-emerald-400 hover:underline">/painel/ajuda</Link>.
      </p>

      {/* Modal abrir chamado */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl border border-emerald-500/30 bg-slate-900 p-6">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-400" /> Abrir chamado
            </h3>

            <label className="mb-1 block text-xs font-medium text-slate-400">Assunto</label>
            <input value={assunto} onChange={e => setAssunto(e.target.value)}
              placeholder="Ex: Pedido não imprime no caixa"
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />

            <label className="mb-1 block text-xs font-medium text-slate-400">Prioridade</label>
            <select value={prioridade} onChange={e => setPrioridade(e.target.value)}
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>

            <label className="mb-1 block text-xs font-medium text-slate-400">Descreva o problema</label>
            <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={6}
              placeholder="Quanto mais detalhes (passos pra reproduzir, prints, mensagens de erro), mais rápido resolvemos."
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white resize-none" />

            {erro && <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-300">{erro}</div>}

            <div className="flex gap-2">
              <button onClick={() => setModal(false)} disabled={enviando}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
                Cancelar
              </button>
              <button onClick={abrirChamado} disabled={enviando}
                className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
                {enviando ? "Abrindo..." : "Abrir chamado"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
