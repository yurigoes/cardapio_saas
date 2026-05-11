"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DollarSign, TrendingUp, CalendarDays, Receipt, RefreshCw, ShoppingBag,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pedido {
  id:          string;
  numero:      number;
  tipo:        string;
  status:      string;
  total:       number;
  created_at:  string;
  cliente_nome: string | null;
  mesa_numero: number | null;
  comanda:     string | null;
}

interface Stats {
  pedidos_hoje:      number;
  pedidos_pendentes: number;
  vendas_hoje:       number;
  ticket_medio:      number;
  clientes_novos:    number;
  tempo_medio_min:   number;
}

type DateRange = "hoje" | "semana" | "mes" | "custom";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day:    "2-digit",
    month:  "2-digit",
    year:   "2-digit",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOf(daysAgo: number) {
  const d = startOfToday();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function filterByRange(pedidos: Pedido[], range: DateRange, customFrom: string, customTo: string): Pedido[] {
  let from: Date;
  let to = new Date();

  switch (range) {
    case "hoje":
      from = startOfToday();
      break;
    case "semana":
      from = startOf(6);
      break;
    case "mes":
      from = startOfMonth();
      break;
    case "custom":
      from = customFrom ? new Date(customFrom) : startOfToday();
      to   = customTo   ? new Date(customTo + "T23:59:59") : new Date();
      break;
  }

  return pedidos.filter((p) => {
    const d = new Date(p.created_at);
    return d >= from && d <= to;
  });
}

function calcRevenue(pedidos: Pedido[]) {
  return pedidos
    .filter((p) => p.status !== "cancelado")
    .reduce((acc, p) => acc + (p.total ?? 0), 0);
}

function calcTicket(pedidos: Pedido[]) {
  const valid = pedidos.filter((p) => p.status !== "cancelado");
  if (valid.length === 0) return 0;
  return valid.reduce((acc, p) => acc + (p.total ?? 0), 0) / valid.length;
}

const TIPO_LABELS: Record<string, string> = {
  mesa:     "Mesa",
  balcao:   "Balcão",
  delivery: "Delivery",
  totem:    "Totem",
  whatsapp: "WhatsApp",
  app:      "App",
};

const STATUS_LABELS: Record<string, string> = {
  pendente:   "Pendente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  pronto:     "Pronto",
  entregue:   "Entregue",
  cancelado:  "Cancelado",
  pago:       "Pago",
};

const STATUS_COLORS: Record<string, string> = {
  pendente:   "text-yellow-400",
  confirmado: "text-blue-400",
  preparando: "text-orange-400",
  pronto:     "text-emerald-400",
  entregue:   "text-green-400",
  cancelado:  "text-red-400",
  pago:       "text-purple-400",
};

// ─── Revenue Bar ──────────────────────────────────────────────────────────────

function RevenueBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  sub,
  accent,
}: {
  label:  string;
  value:  string;
  icon:   React.ElementType;
  sub?:   string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-opacity-10 ${accent.replace("text-", "bg-").replace("-400", "-400/10")}`}>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FinanceiroPage() {
  const [allPedidos, setAllPedidos] = useState<Pedido[]>([]);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [range, setRange]           = useState<DateRange>("hoje");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [page, setPage]             = useState(1);
  const PAGE_SIZE = 15;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [statsRes, pedidosRes] = await Promise.all([
        fetch("/api/painel/stats", { headers }),
        fetch("/api/pedidos?limit=200&status=entregue", { headers }),
      ]);

      const [statsData, pedidosData] = await Promise.all([
        statsRes.json(),
        pedidosRes.json(),
      ]);

      // Also fetch non-entregue (pago, pronto, etc.) to get broader picture
      const [pedidosPago, pedidosTodos] = await Promise.all([
        fetch("/api/pedidos?limit=200&status=pago",      { headers }).then((r) => r.json()),
        fetch("/api/pedidos?limit=200",                  { headers }).then((r) => r.json()),
      ]);

      const entregues = pedidosData.success  ? (pedidosData.data as Pedido[])  : [];
      const pagos     = pedidosPago.success  ? (pedidosPago.data as Pedido[])  : [];
      const todos     = pedidosTodos.success ? (pedidosTodos.data as Pedido[]) : [];

      // Merge, deduplicate
      const map = new Map<string, Pedido>();
      [...entregues, ...pagos, ...todos].forEach((p) => map.set(p.id, p));
      setAllPedidos(Array.from(map.values()));

      if (statsData.success) setStats(statsData.data as Stats);
    } catch (err) {
      console.error("[Financeiro] fetch error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(1); }, [range, customFrom, customTo]);

  const filtered     = filterByRange(allPedidos, range, customFrom, customTo);
  const revenue      = calcRevenue(filtered);
  const ticket       = calcTicket(filtered);
  const totalOrders  = filtered.filter((p) => p.status !== "cancelado").length;
  const cancelled    = filtered.filter((p) => p.status === "cancelado").length;

  // Revenue for week and month for summary cards (always computed from allPedidos)
  const revenueHoje   = calcRevenue(filterByRange(allPedidos, "hoje",   "", ""));
  const revenueSemana = calcRevenue(filterByRange(allPedidos, "semana", "", ""));
  const revenueMes    = calcRevenue(filterByRange(allPedidos, "mes",    "", ""));
  const ticketMedio   = stats?.ticket_medio ?? calcTicket(filterByRange(allPedidos, "hoje", "", ""));

  // Revenue by tipo
  const tipoBreakdown = Object.entries(TIPO_LABELS).map(([tipo, label]) => {
    const sub     = filtered.filter((p) => p.tipo === tipo && p.status !== "cancelado");
    const val     = sub.reduce((acc, p) => acc + (p.total ?? 0), 0);
    return { tipo, label, value: val, count: sub.length };
  }).filter((t) => t.value > 0).sort((a, b) => b.value - a.value);

  const maxTipo = tipoBreakdown.length > 0 ? tipoBreakdown[0].value : 1;

  // Recent orders table
  const sorted   = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged    = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-emerald-400" />
          <div>
            <h1 className="text-2xl font-bold">Financeiro</h1>
            <p className="text-sm text-slate-400">Faturamento e análise de receitas</p>
          </div>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Summary cards (always show totals regardless of date filter) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Hoje"
          value={formatBRL(revenueHoje)}
          icon={DollarSign}
          sub={`${filterByRange(allPedidos, "hoje", "", "").filter((p) => p.status !== "cancelado").length} pedidos`}
          accent="text-emerald-400"
        />
        <SummaryCard
          label="Últimos 7 dias"
          value={formatBRL(revenueSemana)}
          icon={TrendingUp}
          sub="Faturamento da semana"
          accent="text-blue-400"
        />
        <SummaryCard
          label="Mês atual"
          value={formatBRL(revenueMes)}
          icon={CalendarDays}
          sub="Desde o início do mês"
          accent="text-purple-400"
        />
        <SummaryCard
          label="Ticket Médio"
          value={formatBRL(ticketMedio)}
          icon={Receipt}
          sub="Hoje (média por pedido)"
          accent="text-orange-400"
        />
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-slate-900 p-4">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Período:</span>
        {(["hoje", "semana", "mes", "custom"] as DateRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
              range === r
                ? "bg-emerald-500 text-white"
                : "border border-white/10 text-slate-400 hover:text-white hover:border-white/20"
            }`}
          >
            {r === "hoje" ? "Hoje" : r === "semana" ? "7 dias" : r === "mes" ? "Mês" : "Personalizado"}
          </button>
        ))}

        {range === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-xl bg-slate-800 border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
            />
            <span className="text-slate-500 text-xs">até</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-xl bg-slate-800 border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        )}

        {/* Filtered summary */}
        <div className="ml-auto flex items-center gap-4 text-xs text-slate-400">
          <span><span className="text-white font-bold">{totalOrders}</span> pedidos</span>
          <span><span className="text-emerald-400 font-bold">{formatBRL(revenue)}</span> receita</span>
          {cancelled > 0 && (
            <span><span className="text-red-400 font-bold">{cancelled}</span> cancelados</span>
          )}
        </div>
      </div>

      {/* Revenue by type */}
      {tipoBreakdown.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold mb-4 text-slate-300">Receita por Canal</h2>
          <div className="space-y-4">
            {tipoBreakdown.map(({ tipo, label, value, count }) => (
              <div key={tipo}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-slate-500">{count} pedido{count !== 1 ? "s" : ""}</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-400 tabular-nums">{formatBRL(value)}</span>
                </div>
                <RevenueBar value={value} max={maxTipo} color="bg-emerald-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment breakdown note */}
      <div className="rounded-2xl border border-white/5 bg-slate-900 p-5">
        <h2 className="text-sm font-semibold mb-4 text-slate-300">Formas de Pagamento</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Dinheiro",  accent: "text-yellow-400", bg: "bg-yellow-400" },
            { label: "PIX",       accent: "text-emerald-400", bg: "bg-emerald-500" },
            { label: "Cartão",    accent: "text-blue-400", bg: "bg-blue-500" },
          ].map(({ label, accent, bg }) => (
            <div key={label} className="rounded-xl border border-white/5 p-4 text-center">
              <p className={`text-lg font-bold ${accent}`}>N/A</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full w-0 rounded-full ${bg}`} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-3 text-center">
          Detalhamento por forma de pagamento disponível após integração com gateways
        </p>
      </div>

      {/* Recent orders table */}
      <div className="rounded-2xl border border-white/5 bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold">Pedidos do Período</h2>
          </div>
          <span className="text-xs text-slate-500">{sorted.length} registros</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : paged.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <ShoppingBag className="h-10 w-10" />
            <p className="text-sm">Nenhum pedido no período selecionado</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5 text-xs text-slate-500">
                  <th className="px-6 py-3 text-left font-medium">#</th>
                  <th className="px-6 py-3 text-left font-medium hidden sm:table-cell">Data</th>
                  <th className="px-6 py-3 text-left font-medium hidden md:table-cell">Canal</th>
                  <th className="px-6 py-3 text-left font-medium hidden lg:table-cell">Cliente</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paged.map((p) => (
                  <tr key={p.id} className="hover:bg-white/2 transition">
                    <td className="px-6 py-3">
                      <span className="font-mono text-sm font-bold">#{p.numero}</span>
                    </td>
                    <td className="px-6 py-3 hidden sm:table-cell">
                      <span className="text-xs text-slate-400">{formatDate(p.created_at)}</span>
                    </td>
                    <td className="px-6 py-3 hidden md:table-cell">
                      <span className="text-xs text-slate-400">{TIPO_LABELS[p.tipo] ?? p.tipo}</span>
                      {p.mesa_numero && (
                        <span className="text-xs text-slate-600 ml-1">· Mesa {p.mesa_numero}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 hidden lg:table-cell">
                      <span className="text-xs text-slate-400">{p.cliente_nome ?? "—"}</span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`text-xs font-medium ${STATUS_COLORS[p.status] ?? "text-slate-400"}`}>
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className={`text-sm font-bold tabular-nums ${p.status === "cancelado" ? "text-red-400/60 line-through" : "text-emerald-400"}`}>
                        {formatBRL(p.total)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-white/5 px-6 py-3 text-xs text-slate-400">
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} de {sorted.length}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="rounded-lg border border-white/10 px-3 py-1 hover:border-white/20 hover:text-white transition disabled:opacity-30"
                  >
                    Anterior
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="rounded-lg border border-white/10 px-3 py-1 hover:border-white/20 hover:text-white transition disabled:opacity-30"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
