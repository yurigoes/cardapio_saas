"use client";

import { useEffect, useState, useCallback } from "react";
import { ScrollText, RefreshCw, Filter, ChevronDown, ChevronUp } from "lucide-react";

interface AuditRow {
  id: string; acao: string; recurso: string | null; recurso_id: string | null;
  dados_anteriores: unknown; dados_novos: unknown;
  ip_address: string | null; created_at: string;
  usuario_id: string | null; usuario_nome: string | null; usuario_email: string | null;
  empresa_id: string | null; empresa_nome: string | null;
}

const fmtData = (iso: string) => new Date(iso).toLocaleString("pt-BR");

export default function AdminAuditoriaPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [since, setSince] = useState("7d");
  const [acao, setAcao]   = useState("");
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const sp = new URLSearchParams({ since });
      if (acao) sp.set("acao", acao);
      const r = await fetch(`/api/admin/auditoria?${sp}`, { headers: { Authorization: `Bearer ${t}` } });
      const d = await r.json();
      if (d.success) setRows(d.data ?? []);
    } finally { setLoading(false); }
  }, [since, acao]);

  useEffect(() => { carregar(); }, [carregar]);

  function toggle(id: string) {
    setAberto(s => { const ns = new Set(s); ns.has(id) ? ns.delete(id) : ns.add(id); return ns; });
  }

  return (
    <div className="space-y-6 max-w-5xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
              <ScrollText className="h-5 w-5 text-emerald-400" /> Auditoria
            </h1>
            <p className="text-sm text-slate-400">Log de ações sensíveis (criar/editar/excluir/login)</p>
          </div>
          <button onClick={carregar}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
            <RefreshCw className={`h-3.5 w-3.5 inline ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <Filter className="h-4 w-4 text-slate-400" />
          <select value={since} onChange={e => setSince(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white">
            <option value="24h">Últimas 24h</option>
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
          </select>
          <input value={acao} onChange={e => setAcao(e.target.value)}
            placeholder="Filtrar por ação (ex: pedido:criar, master:reset-senha)"
            className="flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white" />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              {loading ? "Carregando..." : "Sem auditoria no período."}
            </p>
          ) : (
            <div className="divide-y divide-white/5">
              {rows.map(r => {
                const open = aberto.has(r.id);
                return (
                  <div key={r.id} className="p-3">
                    <button onClick={() => toggle(r.id)} className="w-full flex items-start gap-3 text-left">
                      <span className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-bold flex-shrink-0 ${
                        r.acao.startsWith("master:") ? "bg-amber-500/20 text-amber-300" :
                        r.acao.includes("delete")    ? "bg-red-500/20 text-red-300" :
                                                       "bg-slate-700 text-slate-300"
                      }`}>{r.acao}</span>
                      <span className="text-xs text-slate-500 flex-shrink-0 mt-1">{fmtData(r.created_at)}</span>
                      <div className="flex-1 min-w-0 text-xs text-slate-400">
                        {r.usuario_email ?? "(sem usuário)"}
                        {r.empresa_nome && ` · ${r.empresa_nome}`}
                        {r.ip_address && ` · ${r.ip_address}`}
                      </div>
                      {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                    </button>
                    {open && (
                      <pre className="mt-2 ml-2 text-xs font-mono text-slate-300 bg-slate-900 p-2 rounded whitespace-pre-wrap break-all">
                        {JSON.stringify({ recurso: r.recurso, recurso_id: r.recurso_id, dados_novos: r.dados_novos, dados_anteriores: r.dados_anteriores }, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>);
}
