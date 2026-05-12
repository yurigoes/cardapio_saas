"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, Download, ShoppingBag, DollarSign,
  TrendingUp, XCircle, Calendar, Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Pedido {
  id:         string;
  numero:     number;
  status:     string;
  tipo:       string;
  total:      number;
  criado_em:  string;
}

type Periodo = "hoje" | "semana" | "mes" | "custom";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader() { return { Authorization: `Bearer ${getToken()}` }; }

function formatBRL(v: number) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day:    "2-digit",
    month:  "2-digit",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function getPeriodDates(periodo: Periodo, custom: { from: string; to: string }): { from: string; to: string } {
  const now   = new Date();
  const today = isoDate(now);
  if (periodo === "hoje")   return { from: today, to: today };
  if (periodo === "semana") {
    const week = new Date(now);
    week.setDate(now.getDate() - 6);
    return { from: isoDate(week), to: today };
  }
  if (periodo === "mes") {
    const month = new Date(now);
    month.setDate(now.getDate() - 29);
    return { from: isoDate(month), to: today };
  }
  return custom;
}

const TIPO_LABEL: Record<string, string> = {
  mesa:    "Mesa",
  totem:   "Totem",
  delivery:"Delivery",
  balcao:  "Balcão",
};

const STATUS_COLOR: Record<string, string> = {
  pendente:   "bg-yellow-500/15 text-yellow-400",
  confirmado: "bg-blue-500/15 text-blue-400",
  preparando: "bg-orange-500/15 text-orange-400",
  pronto:     "bg-brand/15 text-brand",
  entregue:   "bg-brand/15 text-brand",
  cancelado:  "bg-red-500/15 text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  pendente:   "Pendente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  pronto:     "Pronto",
  entregue:   "Entregue",
  cancelado:  "Cancelado",
};

const PERIODO_LABELS: Record<Periodo, string> = {
  hoje:   "Hoje",
  semana: "Última semana",
  mes:    "Último mês",
  custom: "Personalizado",
};

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCSV(pedidos: Pedido[]) {
  const header = ["Nº Pedido", "Data/Hora", "Tipo", "Total (R$)", "Status"];
  const rows   = pedidos.map(p => [
    String(p.numero),
    formatDateTime(p.criado_em),
    TIPO_LABEL[p.tipo] ?? p.tipo,
    Number(p.total).toFixed(2).replace(".", ","),
    STATUS_LABEL[p.status] ?? p.status,
  ]);
  const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `relatorio-pedidos-${isoDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const [pedidos, setPedidos]   = useState<Pedido[]>([]);
  const [loading, setLoading]   = useState(false);
  const [periodo, setPeriodo]   = useState<Periodo>("semana");
  const [custom, setCustom]     = useState({
    from: isoDate(new Date(Date.now() - 7 * 86400000)),
    to:   isoDate(new Date()),
  });

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getPeriodDates(periodo, custom);
      const params = new URLSearchParams({
        limit:  "200",
        status: "entregue,pronto,cancelado,pendente,confirmado,preparando",
        from,
        to,
      });
      const res  = await fetch(`/api/painel/pedidos?${params}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) setPedidos(data.data ?? []);
      else setPedidos([]);
    } catch {
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }, [periodo, custom]);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const entregues    = pedidos.filter(p => p.status === "entregue" || p.status === "pronto");
  const cancelados   = pedidos.filter(p => p.status === "cancelado");
  const faturamento  = entregues.reduce((s, p) => s + Number(p.total), 0);
  const ticketMedio  = entregues.length > 0 ? faturamento / entregues.length : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Relatórios</h1>
          <p className="mt-1 text-sm text-slate-400">
            {pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""} no período
          </p>
        </div>
        <button
          onClick={() => exportCSV(pedidos)}
          disabled={pedidos.length === 0}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40 transition"
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </button>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {(Object.keys(PERIODO_LABELS) as Periodo[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                periodo === p ? "bg-brand/20 text-brand" : "text-slate-400 hover:text-white"
              }`}
            >
              {p === "custom" && <Calendar className="h-3.5 w-3.5" />}
              {PERIODO_LABELS[p]}
            </button>
          ))}
        </div>

        {periodo === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={custom.from}
              onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-brand/50 focus:outline-none"
            />
            <span className="text-slate-500 text-sm">até</span>
            <input
              type="date"
              value={custom.to}
              onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-brand/50 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total pedidos"
          value={String(pedidos.length)}
          icon={ShoppingBag}
          color="text-white"
        />
        <MetricCard
          label="Faturamento"
          value={formatBRL(faturamento)}
          icon={DollarSign}
          color="text-brand"
          sub="pedidos entregues/prontos"
        />
        <MetricCard
          label="Ticket médio"
          value={formatBRL(ticketMedio)}
          icon={TrendingUp}
          color="text-blue-400"
        />
        <MetricCard
          label="Cancelados"
          value={String(cancelados.length)}
          icon={XCircle}
          color={cancelados.length > 0 ? "text-red-400" : "text-slate-400"}
        />
      </div>

      {/* Top produtos note */}
      <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-4">
        <Info className="h-4 w-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-slate-400">
          <span className="font-medium text-slate-300">Relatório de produtos em breve.</span>{" "}
          O detalhamento por produto requer o retorno dos itens de cada pedido — isso será incluído em uma próxima versão da API.
        </p>
      </div>

      {/* Orders table */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand" />
            Pedidos no período
          </h2>
        </div>

        {/* Head */}
        <div className="hidden sm:grid grid-cols-[80px_1fr_100px_110px_110px] gap-x-4 border-b border-white/5 px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
          <span>Nº</span>
          <span>Data/Hora</span>
          <span>Tipo</span>
          <span className="text-right">Total</span>
          <span>Status</span>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        ) : pedidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
            <BarChart3 className="h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhum pedido encontrado neste período</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5 max-h-[480px] overflow-y-auto">
            {pedidos.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.02, 0.4) }}
                className="grid grid-cols-[auto_1fr] sm:grid-cols-[80px_1fr_100px_110px_110px] items-center gap-x-4 px-6 py-3.5"
              >
                {/* Nº */}
                <span className="text-sm font-mono text-slate-400">#{p.numero}</span>

                {/* Data */}
                <div>
                  <p className="text-sm text-white">{formatDateTime(p.criado_em)}</p>
                  {/* Mobile extras */}
                  <div className="flex items-center gap-2 mt-0.5 sm:hidden">
                    <span className="text-xs text-slate-400">{TIPO_LABEL[p.tipo] ?? p.tipo}</span>
                    <span className="text-xs font-medium text-white">{formatBRL(p.total)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-slate-500/15 text-slate-400"}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </div>
                </div>

                {/* Tipo */}
                <p className="hidden sm:block text-sm text-slate-400">{TIPO_LABEL[p.tipo] ?? p.tipo}</p>

                {/* Total */}
                <p className="hidden sm:block text-right text-sm font-medium text-white">{formatBRL(p.total)}</p>

                {/* Status */}
                <span className={`hidden sm:inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium w-fit ${STATUS_COLOR[p.status] ?? "bg-slate-500/15 text-slate-400"}`}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  label, value, icon: Icon, color, sub,
}: {
  label:  string;
  value:  string;
  icon:   React.ElementType;
  color:  string;
  sub?:   string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <p className="text-xs text-slate-400">{label}</p>
      </div>
      <p className={`text-xl font-bold truncate ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
