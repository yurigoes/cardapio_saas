"use client";

/**
 * /painel/pagamentos — Log consolidado de cobranças online
 *
 * Lista todas as transações da tabela pagamentos com pedido associado.
 * Filtros: status, gateway, datas. Botão de sincronização manual.
 */
import { useEffect, useState, useCallback } from "react";
import {
  CreditCard, RefreshCw, Filter, X, Calendar,
  CheckCircle2, Clock, XCircle, AlertCircle, RotateCw,
  Loader2, ArrowRight,
} from "lucide-react";

interface Pagamento {
  id:            string;
  gateway_slug:  string;
  gateway_id:    string;
  metodo:        string;
  status:        string;
  valor:         string;
  gateway_data:  Record<string, unknown> | null;
  created_at:    string;
  updated_at:    string;
  pedido_id:     string | null;
  pedido_numero: number | null;
  pedido_total:  string | null;
  pedido_status: string | null;
  cliente_nome:  string | null;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  aprovado:    { label: "Aprovado",    bg: "bg-brand/15",      text: "text-brand",      icon: CheckCircle2 },
  aguardando:  { label: "Aguardando",  bg: "bg-amber-500/15",  text: "text-amber-300",  icon: Clock        },
  pendente:    { label: "Pendente",    bg: "bg-amber-500/15",  text: "text-amber-300",  icon: Clock        },
  processando: { label: "Processando", bg: "bg-blue-500/15",   text: "text-blue-400",   icon: Loader2      },
  recusado:    { label: "Recusado",    bg: "bg-red-500/15",    text: "text-red-400",    icon: XCircle      },
  cancelado:   { label: "Cancelado",   bg: "bg-slate-500/15",  text: "text-slate-400",  icon: XCircle      },
  estornado:   { label: "Estornado",   bg: "bg-red-500/15",    text: "text-red-400",    icon: AlertCircle  },
};

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader(): HeadersInit { return { Authorization: `Bearer ${getToken()}` }; }

function fmtBRL(v: number | string | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PagamentosPage() {
  const [rows, setRows]       = useState<Pagamento[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [toast, setToast]     = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Filtros
  const [status, setStatus]   = useState("");
  const [gateway, setGateway] = useState("");
  const [from, setFrom]       = useState("");
  const [to, setTo]           = useState("");

  const LIMIT = 50;

  const fetchPagamentos = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (status)  sp.set("status", status);
      if (gateway) sp.set("gateway", gateway);
      if (from)    sp.set("from", from);
      if (to)      sp.set("to", to);
      const res  = await fetch(`/api/painel/pagamentos?${sp}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        setRows(data.data ?? []);
        setTotal(data.meta?.pagination?.total ?? 0);
        setPage(p);
      }
    } finally { setLoading(false); }
  }, [status, gateway, from, to]);

  useEffect(() => {
    const t = setTimeout(() => fetchPagamentos(1), 300);
    return () => clearTimeout(t);
  }, [fetchPagamentos]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function sincronizar(pagId: string, force = false) {
    setSyncing(pagId);
    try {
      const url = force
        ? `/api/painel/pagamentos/${pagId}/sincronizar?force=1`
        : `/api/painel/pagamentos/${pagId}/sincronizar`;
      const res = await fetch(url, { method: "POST", headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        const ef = data.data.efeitos ?? {};
        const acoes: string[] = [];
        if (ef.pedido_confirmado) acoes.push("pedido confirmado");
        if (ef.venda_registrada)  acoes.push("caixa registrado");
        if (ef.push_enviado)      acoes.push("push enviado");

        if (data.data.mudou) {
          setToast({
            type: "ok",
            msg: `${data.data.status_anterior} → ${data.data.status_atual}` +
                 (acoes.length ? ` · ${acoes.join(", ")}` : ""),
          });
        } else if (force) {
          setToast({
            type: "ok",
            msg: acoes.length
              ? `Reprocessado: ${acoes.join(", ")}`
              : `Status confirmado: ${data.data.status_atual} (sem mudança)`,
          });
        } else {
          setToast({ type: "ok", msg: `Status confirmado: ${data.data.status_atual}` });
        }
        fetchPagamentos(page);
      } else {
        setToast({ type: "err", msg: data.error || "Erro ao sincronizar" });
      }
    } catch {
      setToast({ type: "err", msg: "Erro de conexão" });
    } finally { setSyncing(null); }
  }

  function limparFiltros() {
    setStatus(""); setGateway(""); setFrom(""); setTo("");
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasFilters = !!(status || gateway || from || to);
  const totalAprovado = rows
    .filter(r => r.status === "aprovado")
    .reduce((acc, r) => acc + Number(r.valor), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <CreditCard className="h-6 w-6 text-brand" />
            Pagamentos
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {total.toLocaleString("pt-BR")} cobrança{total !== 1 ? "s" : ""}
            {totalAprovado > 0 && ` · ${fmtBRL(totalAprovado)} aprovado nesta página`}
          </p>
        </div>
        <button
          onClick={() => fetchPagamentos(page)}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

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
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white focus:border-brand/50 focus:outline-none"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select
            value={gateway}
            onChange={(e) => setGateway(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white focus:border-brand/50 focus:outline-none"
          >
            <option value="">Todos os gateways</option>
            <option value="mercadopago">Mercado Pago</option>
            <option value="pagarme">Pagar.me</option>
            <option value="asaas">Asaas</option>
            <option value="stone">Stone</option>
            <option value="pix_bancario">PIX Direto</option>
          </select>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 py-2 pl-8 pr-2 text-xs text-white focus:border-brand/50 focus:outline-none"
            />
          </div>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 py-2 pl-8 pr-2 text-xs text-white focus:border-brand/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
          toast.type === "ok"
            ? "border-brand/30 bg-brand/10 text-brand"
            : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {toast.msg}
        </div>
      )}

      {/* Lista */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Nenhuma cobrança registrada
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((p) => {
              const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.pendente;
              const Icon = cfg.icon;
              const isSyncing = syncing === p.id;
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition">
                  <Icon className={`h-5 w-5 flex-shrink-0 ${cfg.text} ${p.status === "processando" ? "animate-spin" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs font-mono text-slate-500 uppercase">{p.gateway_slug}</span>
                      <span className="text-xs text-slate-500">{p.metodo}</span>
                      {p.pedido_numero && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-mono">#{p.pedido_numero}</span>
                          {p.pedido_status && (
                            <span className="text-[10px] text-slate-500">({p.pedido_status})</span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span title={p.gateway_id} className="font-mono truncate max-w-[180px]">
                        {p.gateway_id.slice(0, 16)}{p.gateway_id.length > 16 ? "…" : ""}
                      </span>
                      {p.cliente_nome && <span>· {p.cliente_nome}</span>}
                      <span>· criado {fmtDateTime(p.created_at)}</span>
                      {p.updated_at !== p.created_at && (
                        <span>· atualizado {fmtDateTime(p.updated_at)}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-white">{fmtBRL(p.valor)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => sincronizar(p.id)}
                      disabled={isSyncing || ["aprovado", "estornado", "cancelado"].includes(p.status)}
                      title="Consultar status no gateway"
                      className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition disabled:opacity-30"
                    >
                      {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                    </button>
                    {/* Reprocessar (force) — só aparece para aprovados,
                        para casos de webhook chegou mas processamento interno falhou */}
                    {p.status === "aprovado" && (
                      <button
                        onClick={() => sincronizar(p.id, true)}
                        disabled={isSyncing}
                        title="Reprocessar: força caixa + push + audit (idempotente)"
                        className="flex items-center justify-center h-7 px-2 rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-30 text-[10px] font-bold"
                      >
                        ↻ FORÇAR
                      </button>
                    )}
                  </div>
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
              onClick={() => fetchPagamentos(page - 1)}
              disabled={page === 1 || loading}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-30"
            >Anterior</button>
            <button
              onClick={() => fetchPagamentos(page + 1)}
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-30"
            >Próxima</button>
          </div>
        </div>
      )}
    </div>
  );
}
