"use client";

/**
 * /painel/saude — Status de saúde do sistema
 *
 * Exibe checks em tempo real:
 *   - Banco, Gateways, Evolution, Caixa, Estoque, Pedidos
 *
 * Auto-refresh a cada 30s. Pílula de status agregado no topo.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Activity, Database, CreditCard, MessageCircle, Wallet, Package, ShoppingBag,
  CheckCircle2, AlertTriangle, XCircle, Circle, RefreshCw,
} from "lucide-react";

interface CheckResult {
  status:     "ok" | "warning" | "error" | "disabled";
  message:    string;
  latency_ms?: number;
  detail?:    Record<string, unknown>;
}

interface HealthData {
  overall:        "ok" | "warning" | "error";
  checks: {
    db:        CheckResult;
    gateways:  CheckResult;
    evolution: CheckResult;
    caixa:     CheckResult;
    estoque:   CheckResult;
    pedidos:   CheckResult;
  };
  checked_at:    string;
  total_time_ms: number;
}

const CHECK_ICONS: Record<keyof HealthData["checks"], React.ElementType> = {
  db:        Database,
  gateways:  CreditCard,
  evolution: MessageCircle,
  caixa:     Wallet,
  estoque:   Package,
  pedidos:   ShoppingBag,
};

const CHECK_LABELS: Record<keyof HealthData["checks"], string> = {
  db:        "Banco de Dados",
  gateways:  "Gateways de Pagamento",
  evolution: "WhatsApp (Evolution)",
  caixa:     "Caixa PDV",
  estoque:   "Estoque",
  pedidos:   "Pedidos do Dia",
};

function getToken() { return localStorage.getItem("access_token") ?? ""; }

function statusColor(s: CheckResult["status"]) {
  switch (s) {
    case "ok":       return { text: "text-brand",      bg: "bg-brand/10",       border: "border-brand/30" };
    case "warning":  return { text: "text-amber-300",  bg: "bg-amber-500/10",   border: "border-amber-400/30" };
    case "error":    return { text: "text-red-400",    bg: "bg-red-500/10",     border: "border-red-500/30" };
    case "disabled": return { text: "text-slate-500",  bg: "bg-white/5",        border: "border-white/10" };
  }
}

function statusIcon(s: CheckResult["status"]) {
  switch (s) {
    case "ok":       return CheckCircle2;
    case "warning":  return AlertTriangle;
    case "error":    return XCircle;
    case "disabled": return Circle;
  }
}

export default function SaudePage() {
  const [data, setData]       = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/painel/health", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);
  useEffect(() => {
    const id = setInterval(fetchHealth, 30_000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  if (loading && !data) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p>Não foi possível carregar a saúde do sistema</p>
      </div>
    );
  }

  const overallCfg = statusColor(data.overall);
  const OverallIcon = statusIcon(data.overall);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Activity className="h-6 w-6 text-brand" />
            Saúde do Sistema
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Última verificação: {new Date(data.checked_at).toLocaleTimeString("pt-BR")} ({data.total_time_ms}ms)
          </p>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Status agregado (hero) */}
      <div className={`rounded-2xl border p-6 ${overallCfg.bg} ${overallCfg.border}`}>
        <div className="flex items-center gap-4">
          <OverallIcon className={`h-10 w-10 flex-shrink-0 ${overallCfg.text}`} />
          <div>
            <p className={`text-2xl font-black ${overallCfg.text}`}>
              {data.overall === "ok"      ? "Tudo operacional" :
               data.overall === "warning" ? "Atenção necessária" :
                                            "Falha detectada"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {data.overall === "ok"      ? "Todos os sistemas funcionando normalmente" :
               data.overall === "warning" ? "Alguns componentes precisam de revisão" :
                                            "Há componentes inoperantes que exigem ação"}
            </p>
          </div>
        </div>
      </div>

      {/* Checks individuais */}
      <div className="grid gap-3 md:grid-cols-2">
        {(Object.keys(data.checks) as Array<keyof HealthData["checks"]>).map((key) => {
          const check = data.checks[key];
          const Icon  = CHECK_ICONS[key];
          const StatusIcon = statusIcon(check.status);
          const cfg = statusColor(check.status);
          return (
            <div
              key={key}
              className={`rounded-2xl border bg-white/5 p-5 ${cfg.border}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${cfg.bg}`}>
                    <Icon className={`h-5 w-5 ${cfg.text}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{CHECK_LABELS[key]}</p>
                    <p className="text-xs text-slate-400 truncate">{check.message}</p>
                  </div>
                </div>
                <StatusIcon className={`h-5 w-5 flex-shrink-0 ${cfg.text}`} />
              </div>

              {/* Métricas extras */}
              {(check.latency_ms != null || check.detail) && (
                <div className="mt-3 flex flex-wrap gap-3 border-t border-white/5 pt-3 text-[11px] text-slate-500">
                  {check.latency_ms != null && (
                    <span>
                      <strong className={check.latency_ms > 500 ? "text-amber-300" : "text-slate-300"}>
                        {check.latency_ms}ms
                      </strong> latência
                    </span>
                  )}
                </div>
              )}

              {/* Detalhes de gateways (lista) */}
              {key === "gateways" && check.detail?.gateways != null && (
                <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
                  {(check.detail.gateways as Array<{ slug: string; padrao: boolean; ultima_venda: string | null }>).map((g) => (
                    <div key={g.slug} className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-slate-300">
                        {g.slug}
                        {g.padrao && <span className="ml-1.5 rounded bg-brand/15 px-1 py-0.5 text-[9px] font-bold text-brand">PADRÃO</span>}
                      </span>
                      <span className="text-slate-500">
                        {g.ultima_venda
                          ? `última venda ${new Date(g.ultima_venda).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                          : "sem vendas"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Auto-refresh hint */}
      <p className="text-center text-xs text-slate-600">
        Atualização automática a cada 30 segundos
      </p>
    </div>
  );
}
