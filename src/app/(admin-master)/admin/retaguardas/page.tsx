"use client";

/**
 * /admin/retaguardas — Listagem de retaguardas (master)
 *
 * Mostra todas as retaguardas cadastradas com status online/offline,
 * último heartbeat, IP e domínio. Permite forçar refresh.
 */
import { useEffect, useState } from "react";
import { Server, RefreshCw, CircleCheck, CircleAlert, CircleX, Globe } from "lucide-react";

interface Retaguarda {
  id:                string;
  retaguarda_id:     string;
  empresa_slug:      string;
  dominio:           string | null;
  ip_publico:        string | null;
  versao:            string | null;
  primeira_vez:      string;
  ultimo_heartbeat:  string;
  segundos_desde:    number;
  online:            boolean;
  label_status:      "online" | "instavel" | "offline";
  metricas:          Record<string, unknown>;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function tempoRelativo(s: number): string {
  if (s < 60)         return `${s}s atrás`;
  if (s < 3600)       return `${Math.floor(s / 60)}min atrás`;
  if (s < 86400)      return `${Math.floor(s / 3600)}h atrás`;
  return `${Math.floor(s / 86400)}d atrás`;
}

export default function RetaguardasPage() {
  const [data,    setData]    = useState<Retaguarda[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");

  async function load() {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/admin/retaguardas", { headers: authHeaders(), cache: "no-store" });
      const d = await r.json();
      if (!d.success) { setErr(d.error || "Erro"); return; }
      setData(d.data ?? []);
    } catch { setErr("Erro de conexão"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const online   = data.filter(r => r.label_status === "online").length;
  const instavel = data.filter(r => r.label_status === "instavel").length;
  const offline  = data.filter(r => r.label_status === "offline").length;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Server className="h-6 w-6 text-brand" />
            Retaguardas
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Mini-PCs nas lojas servindo cache local e reduzindo carga do master.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 transition"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </header>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-emerald-400" />
            <p className="text-xs uppercase text-slate-400">Online</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-white">{online}</p>
        </div>
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-amber-400" />
            <p className="text-xs uppercase text-slate-400">Instável</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-white">{instavel}</p>
        </div>
        <div className="rounded-xl border border-red-400/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2">
            <CircleX className="h-4 w-4 text-red-400" />
            <p className="text-xs uppercase text-slate-400">Offline</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-white">{offline}</p>
        </div>
      </div>

      {err && <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{err}</p>}

      {/* Tabela */}
      {loading && data.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/5 p-12 text-center text-slate-500">
          <Server className="mx-auto h-10 w-10 opacity-30 mb-3" />
          <p className="text-sm">Nenhuma retaguarda registrada ainda.</p>
          <p className="mt-1 text-xs">Instale o pacote em /retaguarda no mini-PC do restaurante.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5 bg-white/5">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-left">Domínio</th>
                <th className="px-4 py-3 text-left">IP</th>
                <th className="px-4 py-3 text-left">Último heartbeat</th>
                <th className="px-4 py-3 text-left">Cadastrada</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white font-medium">{r.empresa_slug}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {r.dominio ? (
                      <span className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-slate-500" />
                        {r.dominio}
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.ip_publico ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{tempoRelativo(r.segundos_desde)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(r.primeira_vez).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    {r.label_status === "online" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        online
                      </span>
                    )}
                    {r.label_status === "instavel" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        instável
                      </span>
                    )}
                    {r.label_status === "offline" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        offline
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="rounded-xl border border-white/5 bg-white/5 p-4 text-xs text-slate-500">
        Heartbeat a cada 60s. Considera <strong className="text-slate-400">online</strong> se &lt; 90s,
        <strong className="text-amber-400"> instável</strong> entre 90–180s,
        <strong className="text-red-400"> offline</strong> &gt; 180s.
        Atualiza automaticamente a cada 30s.
      </footer>
    </div>
  );
}
