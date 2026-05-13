"use client";

/**
 * /admin/observability — viewer de erros server + client.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Bug, RefreshCw, AlertTriangle, AlertCircle, Activity, Server, Globe,
} from "lucide-react";

interface ErroRow {
  id:         string;
  level:      "error" | "warn" | "fatal";
  origem:     "server" | "client";
  message:    string;
  rota:       string | null;
  metodo:     string | null;
  user_agent: string | null;
  ip_origem:  string | null;
  created_at: string;
  empresa_id: string | null;
  usuario_id: string | null;
}

interface Resumo { total: number; erros: number; warns: number; clients: number; }
interface TopRota { rota: string; total: number; }
interface Hora { hora: string; total: number; }

const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });

export default function ObservabilityPage() {
  const [data, setData] = useState<{
    data: ErroRow[]; resumo: Resumo; top_rotas: TopRota[]; por_hora: Hora[];
    meta: { pagination: { total: number } };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [since, setSince]     = useState<"24h" | "7d" | "30d">("24h");
  const [level, setLevel]     = useState<string>("");
  const [origem, setOrigem]   = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const t  = localStorage.getItem("access_token") ?? "";
      const sp = new URLSearchParams({ since, limit: "100" });
      if (level)  sp.set("level", level);
      if (origem) sp.set("origem", origem);
      const r = await fetch(`/api/admin/observability?${sp}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const d = await r.json();
      if (d.success) setData(d.data);
    } finally { setLoading(false); }
  }, [since, level, origem]);

  useEffect(() => { carregar(); }, [carregar]);

  const maxHora = Math.max(1, ...(data?.por_hora ?? []).map(h => h.total));

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Bug className="h-5 w-5 text-red-400" />
            Observability
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Erros server-side + client-side capturados pelos últimos {since === "24h" ? "24 horas" : since === "7d" ? "7 dias" : "30 dias"}
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        <select value={since} onChange={e => setSince(e.target.value as typeof since)}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white">
          <option value="24h">Últimas 24h</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
        </select>
        <select value={level} onChange={e => setLevel(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white">
          <option value="">Todos níveis</option>
          <option value="fatal">Fatal</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
        </select>
        <select value={origem} onChange={e => setOrigem(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white">
          <option value="">Todas origens</option>
          <option value="server">Server</option>
          <option value="client">Client (browser)</option>
        </select>
      </div>

      {/* KPIs */}
      {data?.resumo && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total",   v: data.resumo.total,   color: "text-white",     icon: Activity },
            { label: "Errors",  v: data.resumo.erros,   color: "text-red-400",   icon: AlertCircle },
            { label: "Warnings", v: data.resumo.warns,  color: "text-amber-400", icon: AlertTriangle },
            { label: "Browser", v: data.resumo.clients, color: "text-blue-400",  icon: Globe },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
                  <Icon className={`h-3.5 w-3.5 ${s.color} opacity-50`} />
                </div>
                <p className={`mt-1 text-3xl font-bold ${s.color}`}>{s.v}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart por hora */}
      {data?.por_hora && data.por_hora.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Distribuição por hora</h3>
          <div className="flex items-end gap-1 h-24">
            {data.por_hora.map(h => (
              <div key={h.hora} className="flex-1 flex flex-col items-center gap-1 group">
                <div title={`${h.hora}: ${h.total}`} className="w-full bg-red-500/40 hover:bg-red-500/60 rounded-t"
                  style={{ height: `${(h.total / maxHora) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top rotas */}
      {data?.top_rotas && data.top_rotas.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Top rotas com erro</h3>
          <div className="space-y-2">
            {data.top_rotas.map(r => (
              <div key={r.rota} className="flex items-center justify-between text-sm">
                <code className="text-slate-300 truncate">{r.rota}</code>
                <span className="font-mono text-red-400 font-bold flex-shrink-0">{r.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista erros */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="border-b border-white/5 p-3 text-xs font-semibold text-slate-500">
          Erros recentes ({data?.meta?.pagination?.total ?? 0})
        </div>
        {!data || data.data.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Nenhum erro no período</p>
        ) : (
          <div className="divide-y divide-white/5">
            {data.data.map(e => {
              const corLevel = e.level === "fatal" ? "text-red-500"
                             : e.level === "error" ? "text-red-400" : "text-amber-400";
              const Icon    = e.origem === "server" ? Server : Globe;
              const isOpen  = expanded === e.id;
              return (
                <div key={e.id}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : e.id)}
                    className="w-full text-left p-3 hover:bg-white/5 transition flex items-start gap-3"
                  >
                    <Icon className={`h-3.5 w-3.5 mt-0.5 ${corLevel} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-[10px] font-bold uppercase ${corLevel}`}>{e.level}</span>
                        <span className="text-[10px] text-slate-500">{e.origem}</span>
                        {e.rota && <code className="text-[11px] text-slate-400 truncate">{e.metodo} {e.rota}</code>}
                        <span className="text-[10px] text-slate-600 ml-auto">{fmtDate(e.created_at)}</span>
                      </div>
                      <p className="mt-1 text-sm text-white truncate">{e.message}</p>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-0 text-[11px] space-y-2">
                      {e.user_agent && (
                        <div>
                          <span className="text-slate-500">User-Agent: </span>
                          <span className="text-slate-300">{e.user_agent}</span>
                        </div>
                      )}
                      {e.ip_origem && (
                        <div>
                          <span className="text-slate-500">IP: </span>
                          <span className="text-slate-300 font-mono">{e.ip_origem}</span>
                        </div>
                      )}
                      {e.empresa_id && (
                        <div>
                          <span className="text-slate-500">Empresa: </span>
                          <code className="text-slate-300">{e.empresa_id.slice(0, 8)}...</code>
                        </div>
                      )}
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
