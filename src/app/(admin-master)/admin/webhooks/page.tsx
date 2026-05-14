"use client";

/**
 * /admin/webhooks — Log cross-tenant de webhooks recebidos
 *
 * Visão master de todos os webhooks dos gateways.
 * Útil para detectar problemas sistêmicos (gateway X falhando para
 * múltiplas empresas, assinaturas inválidas em massa, etc).
 */
import { useEffect, useState, useCallback } from "react";
import {
  Webhook, RefreshCw, Filter, X, Calendar,
  CheckCircle2, XCircle, AlertCircle, Clock, Building2, Repeat,
} from "lucide-react";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";

interface WebhookEntry {
  id: string; gateway_slug: string; evento: string | null;
  recurso_id: string | null; pedido_id: string | null;
  resultado: string; http_status: number | null; mensagem: string | null;
  ip_origem: string | null; recebido_em: string;
  empresa_id: string | null; empresa_nome: string | null;
  pedido_numero: number | null;
}

const RESULTADO_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  processado:           { label: "OK",          bg: "bg-emerald-500/15",  text: "text-emerald-400",  icon: CheckCircle2 },
  recebido:             { label: "Recebido",    bg: "bg-blue-500/15",     text: "text-blue-400",     icon: Clock        },
  ignorado:             { label: "Ignorado",    bg: "bg-slate-500/15",    text: "text-slate-400",    icon: AlertCircle  },
  falha:                { label: "Falha",       bg: "bg-red-500/15",      text: "text-red-400",      icon: XCircle      },
  assinatura_invalida:  { label: "Assinatura!", bg: "bg-red-500/15",      text: "text-red-400",      icon: XCircle      },
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function AdminWebhooksPage() {
  const [rows, setRows]       = useState<WebhookEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);

  const [gateway, setGateway]     = useState("");
  const [resultado, setResultado] = useState("");
  const [from, setFrom]           = useState("");
  const [to, setTo]               = useState("");

  const LIMIT = 50;

  const fetchLog = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const sp = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (gateway)   sp.set("gateway", gateway);
      if (resultado) sp.set("resultado", resultado);
      if (from)      sp.set("from", from);
      if (to)        sp.set("to", to);
      const res  = await fetch(`/api/admin/webhook-log?${sp}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setRows(data.data ?? []);
        setTotal(data.meta?.pagination?.total ?? 0);
        setPage(p);
      }
    } finally { setLoading(false); }
  }, [gateway, resultado, from, to]);

  useEffect(() => {
    const t = setTimeout(() => fetchLog(1), 300);
    return () => clearTimeout(t);
  }, [fetchLog]);

  function limparFiltros() {
    setGateway(""); setResultado(""); setFrom(""); setTo("");
  }

  const REPLAY_SUPORTADOS = new Set(["mercadopago", "pagarme", "asaas", "stone"]);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  async function reenviar(id: string) {
    if (!await confirmar({ titulo: "Reenviar este webhook?", mensagem: "O processamento gerará um novo registro no log.", okLabel: "Reenviar" })) return;
    setReplayingId(id);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`/api/admin/webhook-log/${id}/replay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (d.success) {
        await alertar({ titulo: "Reenviado", mensagem: `Status: ${d.data.replay_status}`, tipo: "sucesso" });
        fetchLog(page);
      } else {
        await alertar({ titulo: "Falha no reenvio", mensagem: d.error?.message ?? "", tipo: "perigo" });
      }
    } finally { setReplayingId(null); }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasFilters = !!(gateway || resultado || from || to);

  // Agregados visuais (apenas página atual)
  const stats = rows.reduce((acc, r) => {
    acc[r.resultado] = (acc[r.resultado] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Webhook className="h-5 w-5 text-emerald-400" />
            Webhook Log (cross-tenant)
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {total.toLocaleString("pt-BR")} webhook{total !== 1 ? "s" : ""} registrado{total !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => fetchLog(page)}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Stats da página atual */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {(Object.keys(RESULTADO_CONFIG) as Array<keyof typeof RESULTADO_CONFIG>).map((k) => {
            const cfg = RESULTADO_CONFIG[k];
            const n = stats[k] ?? 0;
            return (
              <div key={k} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{cfg.label}</p>
                <p className={`mt-1 text-xl font-bold ${cfg.text}`}>{n}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-300">Filtros</span>
          {hasFilters && (
            <button onClick={limparFiltros} className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-white">
              <X className="h-3 w-3" /> Limpar
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            value={gateway}
            onChange={(e) => setGateway(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white focus:border-emerald-500/50 focus:outline-none"
          >
            <option value="">Todos os gateways</option>
            <option value="mercadopago">Mercado Pago</option>
            <option value="pagarme">Pagar.me</option>
            <option value="asaas">Asaas</option>
            <option value="stone">Stone</option>
          </select>
          <select
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white focus:border-emerald-500/50 focus:outline-none"
          >
            <option value="">Todos resultados</option>
            {Object.entries(RESULTADO_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 py-2 pl-8 pr-2 text-xs text-white focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 py-2 pl-8 pr-2 text-xs text-white focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Nenhum webhook encontrado
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((r) => {
              const cfg = RESULTADO_CONFIG[r.resultado] ?? RESULTADO_CONFIG.recebido;
              const Icon = cfg.icon;
              return (
                <div key={r.id} className="flex items-start gap-3 px-5 py-3 hover:bg-white/5 transition group">
                  <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${cfg.text}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs font-mono text-slate-300 uppercase">{r.gateway_slug}</span>
                      {r.evento && <span className="text-xs text-slate-400">{r.evento}</span>}
                      {r.empresa_nome && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-500">
                          <Building2 className="h-3 w-3" />
                          {r.empresa_nome}
                        </span>
                      )}
                      {r.pedido_numero && (
                        <span className="text-[11px] font-mono text-slate-500">#{r.pedido_numero}</span>
                      )}
                    </div>
                    {r.mensagem && (
                      <p className="mt-0.5 text-xs text-slate-400 truncate">{r.mensagem}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      {fmtDateTime(r.recebido_em)}
                      {r.ip_origem && ` · ${r.ip_origem}`}
                      {r.http_status && ` · HTTP ${r.http_status}`}
                      {r.recurso_id && ` · ${r.recurso_id.slice(0, 16)}${r.recurso_id.length > 16 ? "…" : ""}`}
                    </p>
                  </div>
                  {REPLAY_SUPORTADOS.has(r.gateway_slug) && (
                    <button
                      onClick={() => reenviar(r.id)}
                      disabled={replayingId === r.id}
                      title="Reenviar este webhook"
                      className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white transition disabled:opacity-30"
                    >
                      <Repeat className={`h-3 w-3 ${replayingId === r.id ? "animate-spin" : ""}`} />
                      Reenviar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">Página {page} de {totalPages}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchLog(page - 1)}
              disabled={page === 1 || loading}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-30"
            >Anterior</button>
            <button
              onClick={() => fetchLog(page + 1)}
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-30"
            >Próxima</button>
          </div>
        </div>
      )}
    </div>
  );
}
