"use client";

/**
 * /admin/erros — view do error_log com filtros e botão "copiar tudo".
 *
 * Uso típico: usuário copia 1 ou todos os erros pra mandar no chat
 * de suporte. Cada erro tem botão de copiar individual.
 */
import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle, RefreshCw, Copy, Check, Trash2, Filter,
  ChevronDown, ChevronUp, Search, BarChart3,
} from "lucide-react";

interface ErroRow {
  id:          string;
  level:       string;
  origem:      string;
  message:     string;
  rota:        string | null;
  metodo:      string | null;
  user_agent:  string | null;
  ip_origem:   string | null;
  empresa_id:  string | null;
  usuario_id:  string | null;
  created_at:  string;
}
interface Resumo {
  total: number; erros: number; warns: number; clients: number;
}
interface TopRota { rota: string; total: number }

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR");

export default function ErrosPage() {
  const [rows, setRows]       = useState<ErroRow[]>([]);
  const [resumo, setResumo]   = useState<Resumo | null>(null);
  const [topRotas, setTop]    = useState<TopRota[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroLevel, setFL]  = useState<string>("");
  const [filtroOrigem, setFO] = useState<string>("");
  const [filtroSince, setFS]  = useState<string>("24h");
  const [busca, setBusca]     = useState("");
  const [expandido, setExp]   = useState<Set<string>>(new Set());
  const [copiado, setCopiado] = useState<string | null>(null);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set("since", filtroSince);
      sp.set("limit", "100");
      if (filtroLevel)  sp.set("level",  filtroLevel);
      if (filtroOrigem) sp.set("origem", filtroOrigem);
      const r = await fetch(`/api/admin/observability?${sp}`, { headers: auth() });
      const d = await r.json();
      if (d.success) {
        setRows(d.data?.data ?? []);
        setResumo(d.data?.resumo ?? null);
        setTop(d.data?.top_rotas ?? []);
      }
    } finally { setLoading(false); }
  }, [filtroLevel, filtroOrigem, filtroSince]);

  useEffect(() => { carregar(); }, [carregar]);

  function copiar(s: string, id: string) {
    navigator.clipboard.writeText(s).then(() => {
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2000);
    });
  }

  function copiarTodos() {
    const texto = rowsFiltradas.map(r =>
      `[${fmt(r.created_at)}] ${r.level.toUpperCase()} ${r.origem}\n` +
      `${r.metodo ?? ""} ${r.rota ?? "(sem rota)"}\n` +
      r.message +
      (r.ip_origem ? `\n  ip: ${r.ip_origem}` : "") +
      `\n${"─".repeat(80)}`
    ).join("\n");
    copiar(texto, "todos");
  }

  function toggleExp(id: string) {
    setExp(s => {
      const ns = new Set(s);
      if (ns.has(id)) ns.delete(id); else ns.add(id);
      return ns;
    });
  }

  const rowsFiltradas = busca
    ? rows.filter(r =>
        r.message.toLowerCase().includes(busca.toLowerCase()) ||
        (r.rota ?? "").toLowerCase().includes(busca.toLowerCase())
      )
    : rows;

  return (
    <div className="space-y-6 pb-12 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Erros do sistema
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Logs de erros server e client — útil pra mandar pro suporte
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={copiarTodos} disabled={rows.length === 0}
            className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40">
            {copiado === "todos" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Copiar todos ({rowsFiltradas.length})
          </button>
          <button onClick={carregar}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* Resumo */}
      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card titulo="Total"   valor={resumo.total}   cor="text-white" />
          <Card titulo="Erros"   valor={resumo.erros}   cor="text-red-400" />
          <Card titulo="Warns"   valor={resumo.warns}   cor="text-amber-400" />
          <Card titulo="Client"  valor={resumo.clients} cor="text-blue-400" />
        </div>
      )}

      {/* Top rotas */}
      {topRotas.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            <BarChart3 className="h-4 w-4" /> Top rotas com erro
          </h3>
          <div className="space-y-1">
            {topRotas.slice(0, 5).map(r => (
              <div key={r.rota} className="flex justify-between text-sm">
                <code className="text-slate-300 truncate">{r.rota}</code>
                <span className="font-mono text-amber-400">{r.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-slate-400" />
        <select value={filtroSince} onChange={e => setFS(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white">
          <option value="24h">Últimas 24h</option>
          <option value="7d">Últimos 7d</option>
          <option value="30d">Últimos 30d</option>
        </select>
        <select value={filtroLevel} onChange={e => setFL(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white">
          <option value="">Todos níveis</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
          <option value="fatal">Fatal</option>
        </select>
        <select value={filtroOrigem} onChange={e => setFO(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white">
          <option value="">Server e Client</option>
          <option value="server">Só Server</option>
          <option value="client">Só Client</option>
        </select>
        <div className="flex-1 relative">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar em mensagem ou rota..."
            className="w-full rounded-lg border border-white/10 bg-slate-800 pl-9 pr-3 py-1.5 text-xs text-white" />
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {rowsFiltradas.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            {loading ? "Carregando..." : "Sem erros no período selecionado 🎉"}
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {rowsFiltradas.map(r => {
              const aberto = expandido.has(r.id);
              return (
                <div key={r.id} className="p-3">
                  <button onClick={() => toggleExp(r.id)}
                    className="w-full flex items-start gap-3 text-left">
                    <span className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-bold flex-shrink-0 ${
                      r.level === "error" ? "bg-red-500/20 text-red-300" :
                      r.level === "warn"  ? "bg-amber-500/20 text-amber-300" :
                                            "bg-slate-700 text-slate-300"
                    }`}>{r.level.toUpperCase()}</span>
                    <span className="text-xs text-slate-500 mt-1 flex-shrink-0">{fmt(r.created_at)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-slate-300 truncate">
                        {r.metodo} {r.rota ?? "(sem rota)"}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{r.message}</p>
                    </div>
                    {aberto ? <ChevronUp className="h-4 w-4 text-slate-500 flex-shrink-0" />
                            : <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />}
                  </button>

                  {aberto && (
                    <div className="mt-3 ml-2 space-y-2">
                      <div className="rounded-lg bg-slate-900 p-3 text-xs font-mono whitespace-pre-wrap break-all text-slate-200">
                        {r.message}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        {r.origem && <span>origem: <code>{r.origem}</code></span>}
                        {r.ip_origem && <span>ip: <code>{r.ip_origem}</code></span>}
                        {r.empresa_id && <span>empresa: <code>{r.empresa_id.slice(0, 8)}</code></span>}
                        {r.usuario_id && <span>user: <code>{r.usuario_id.slice(0, 8)}</code></span>}
                      </div>
                      {r.user_agent && (
                        <p className="text-xs text-slate-500 truncate" title={r.user_agent}>
                          UA: {r.user_agent.slice(0, 80)}...
                        </p>
                      )}
                      <button onClick={() => copiar(
                        `[${fmt(r.created_at)}] ${r.level.toUpperCase()}\n` +
                        `${r.metodo ?? ""} ${r.rota ?? ""}\n${r.message}` +
                        (r.user_agent ? `\nUA: ${r.user_agent}` : "")
                      , r.id)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                        {copiado === r.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copiado === r.id ? "Copiado!" : "Copiar este erro"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs uppercase font-semibold text-slate-500">{titulo}</p>
      <p className={`text-2xl font-bold mt-0.5 ${cor}`}>{valor.toLocaleString("pt-BR")}</p>
    </div>
  );
}
