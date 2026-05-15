"use client";

/**
 * /admin/maquinas — Lista TODAS as máquinas conectadas (todas as empresas).
 * Master only. Mostra status online/offline/aguardando, IP, versão, empresa,
 * última atividade. Filtros por status, tipo, empresa, busca por nome.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Server, Monitor, Tv2, Smartphone, Printer, Box,
  Search, Filter, RefreshCw, Activity,
  CheckCircle2, XCircle, Clock, AlertTriangle,
} from "lucide-react";

interface Agente {
  id:                string;
  agente_id:         string;
  empresa_id:        string;
  empresa_nome:      string | null;
  tipo:              string;
  nome:              string;
  hostname:          string | null;
  ip_ultimo:         string | null;
  plataforma:        string | null;
  versao:            string | null;
  status:            "online" | "offline" | "aguardando" | "desativado";
  ultimo_hb_em:      string | null;
  primeiro_hb_em:    string | null;
  registrado_em:     string;
  fila_pendente:     number;
  ultimo_pedido_em:  string | null;
  alertado_em:       string | null;
  alertas_count:     number;
}

const TIPO_ICONS: Record<string, typeof Server> = {
  retaguarda: Server,
  terminal:   Monitor,
  kiosk:      Tv2,
  tv:         Tv2,
  garcom:     Smartphone,
  impressora: Printer,
  outro:      Box,
};

const STATUS_BADGES: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  online:     { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2, label: "Online" },
  offline:    { color: "bg-red-500/15 text-red-400 border-red-500/30",            icon: XCircle,      label: "Offline" },
  aguardando: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30",      icon: Clock,        label: "Aguardando 1º hb" },
  desativado: { color: "bg-slate-500/15 text-slate-400 border-slate-500/30",      icon: AlertTriangle,label: "Desativado" },
};

function tempoAtras(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "agora";
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60)    return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24)    return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminMaquinasPage() {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [stats,   setStats]   = useState<Record<string, number>>({});
  const [busca,   setBusca]   = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [filtroTipo,   setFiltroTipo]   = useState<string>("");
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroStatus) params.set("status", filtroStatus);
      if (filtroTipo)   params.set("tipo",   filtroTipo);
      if (busca)        params.set("q",      busca);
      const r = await fetch(`/api/admin/agentes?${params}`, { headers: authHeaders(), cache: "no-store" });
      const data = await r.json();
      if (data.success) {
        setAgentes(data.data.agentes ?? []);
        setStats(data.data.stats ?? {});
      }
    } catch {/* */}
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const t = setInterval(carregar, 30000);   // refresh 30s
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [filtroStatus, filtroTipo, busca]);

  const filtrados = useMemo(() => agentes, [agentes]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Máquinas conectadas</h1>
          <p className="text-xs text-slate-400">Visão global de retaguardas, terminais, kiosks e demais agentes do SaaS.</p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </header>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["online","offline","aguardando","desativado"] as const).map((s) => {
          const cfg = STATUS_BADGES[s];
          const Icon = cfg.icon;
          return (
            <button
              key={s}
              onClick={() => setFiltroStatus(filtroStatus === s ? "" : s)}
              className={`flex items-center justify-between rounded-xl border p-4 transition ${
                filtroStatus === s
                  ? cfg.color + " ring-2 ring-white/20"
                  : "border-white/10 bg-slate-900 hover:bg-white/5"
              }`}
            >
              <div className="text-left">
                <p className="text-xs uppercase tracking-wider text-slate-400">{cfg.label}</p>
                <p className="mt-1 text-2xl font-bold text-white">{stats[s] ?? 0}</p>
              </div>
              <Icon className={`h-8 w-8 opacity-60 ${filtroStatus === s ? "" : "text-slate-500"}`} />
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-900 p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && carregar()}
            placeholder="Buscar por nome ou hostname..."
            className="w-full rounded-lg bg-slate-950 pl-10 pr-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:ring-1 focus:ring-emerald-500/40"
          />
        </div>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="rounded-lg bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500/40"
        >
          <option value="">Todos tipos</option>
          <option value="retaguarda">Retaguarda</option>
          <option value="terminal">Terminal</option>
          <option value="kiosk">Kiosk</option>
          <option value="tv">TV</option>
          <option value="garcom">Garçom</option>
          <option value="impressora">Impressora</option>
        </select>
        <button
          onClick={carregar}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600"
        >
          <Filter className="h-3.5 w-3.5" />
          Filtrar
        </button>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-950 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Máquina</th>
              <th className="px-4 py-3 text-left">Empresa</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">IP / Plataforma</th>
              <th className="px-4 py-3 text-left">Último heartbeat</th>
              <th className="px-4 py-3 text-left">Fila</th>
              <th className="px-4 py-3 text-left">Versão</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  {loading ? "Carregando..." : "Nenhuma máquina encontrada"}
                </td>
              </tr>
            ) : filtrados.map((a) => {
              const Icon = TIPO_ICONS[a.tipo] ?? Box;
              const cfg  = STATUS_BADGES[a.status] ?? STATUS_BADGES.aguardando;
              const StatusIcon = cfg.icon;
              return (
                <tr key={a.id} className="border-t border-white/5 transition hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="font-medium text-white">{a.nome}</p>
                        <p className="text-[10px] uppercase text-slate-500">{a.tipo}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{a.empresa_nome ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cfg.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    <p>{a.ip_ultimo ?? "—"}</p>
                    <p className="text-[10px] text-slate-500">{a.plataforma ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {tempoAtras(a.ultimo_hb_em)}
                    {a.alertas_count > 0 && (
                      <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {a.alertas_count}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.fila_pendente > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400">
                        <Activity className="h-3 w-3" />
                        {a.fila_pendente}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{a.versao ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
