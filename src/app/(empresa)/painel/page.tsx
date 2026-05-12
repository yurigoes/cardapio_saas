"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBag, DollarSign, Clock, CheckCircle,
  TrendingUp, Users, Package, AlertCircle,
} from "lucide-react";

interface PainelStats {
  pedidos_hoje:      number;
  pedidos_pendentes: number;
  vendas_hoje:       number;
  ticket_medio:      number;
  clientes_novos:    number;
  tempo_medio_min:   number;
}

interface PedidoRecente {
  id:          string;
  numero:      number;
  tipo:        string;
  status:      string;
  total:       number;
  cliente_nome: string | null;
  created_at:  string;
}

const STATUS_LABELS: Record<string, { label: string; style: string }> = {
  pendente:             { label: "Pendente",   style: "bg-amber-500/15 text-amber-400"   },
  confirmado:           { label: "Confirmado", style: "bg-blue-500/15 text-blue-400"     },
  preparando:           { label: "Preparando", style: "bg-violet-500/15 text-violet-400" },
  pronto:               { label: "Pronto",     style: "bg-brand/15 text-brand"},
  entregue:             { label: "Entregue",   style: "bg-slate-500/15 text-slate-400"   },
  cancelado:            { label: "Cancelado",  style: "bg-red-500/15 text-red-400"       },
  aguardando_pagamento: { label: "Pagamento",  style: "bg-orange-500/15 text-orange-400" },
};

const TIPO_LABELS: Record<string, string> = {
  mesa:     "Mesa",
  balcao:   "Balcão",
  delivery: "Delivery",
  ifood:    "iFood",
  consumer: "Consumer",
  totem:    "Totem",
  whatsapp: "WhatsApp",
};

export default function PainelDashboard() {
  const [stats,   setStats]   = useState<PainelStats | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRecente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    Promise.all([
      fetch("/api/painel/stats",          { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch("/api/pedidos?limit=8&page=1", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([statsData, pedidosData]) => {
      if (statsData.success)   setStats(statsData.data);
      if (pedidosData.success)  setPedidos(pedidosData.data);
    }).finally(() => setLoading(false));
  }, []);

  const STAT_CARDS = [
    { label: "Pedidos Hoje",   value: stats?.pedidos_hoje ?? 0,      icon: ShoppingBag, color: "blue",    format: "number"   },
    { label: "Pendentes",      value: stats?.pedidos_pendentes ?? 0,  icon: Clock,       color: "amber",   format: "number"   },
    { label: "Vendas Hoje",    value: stats?.vendas_hoje ?? 0,        icon: DollarSign,  color: "emerald", format: "currency" },
    { label: "Ticket Médio",   value: stats?.ticket_medio ?? 0,       icon: TrendingUp,  color: "violet",  format: "currency" },
    { label: "Clientes Novos", value: stats?.clientes_novos ?? 0,     icon: Users,       color: "pink",    format: "number"   },
    { label: "Tempo Médio",    value: stats?.tempo_medio_min ?? 0,    icon: CheckCircle, color: "cyan",    format: "minutes"  },
  ] as const;

  const COLOR_MAP: Record<string, string> = {
    blue:    "bg-blue-500/15 text-blue-400",
    amber:   "bg-amber-500/15 text-amber-400",
    emerald: "bg-brand/15 text-brand",
    violet:  "bg-violet-500/15 text-violet-400",
    pink:    "bg-pink-500/15 text-pink-400",
    cyan:    "bg-cyan-500/15 text-cyan-400",
  };

  function formatValue(value: number, format: string): string {
    if (format === "currency") return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (format === "minutes")  return `${value} min`;
    return value.toLocaleString("pt-BR");
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="mt-0.5 text-sm text-slate-400">
          {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {STAT_CARDS.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${COLOR_MAP[card.color]}`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-xl font-bold text-white">
                {formatValue(card.value, card.format)}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{card.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Pedidos Recentes */}
      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Pedidos Recentes</h2>
          <a href="/painel/pedidos" className="text-xs text-brand hover:underline">
            Ver todos
          </a>
        </div>

        <div className="divide-y divide-white/5">
          {pedidos.length === 0 && (
            <div className="flex flex-col items-center py-10 text-slate-500">
              <Package className="mb-2 h-8 w-8" />
              <p className="text-sm">Nenhum pedido hoje</p>
            </div>
          )}

          {pedidos.map((pedido) => {
            const status = STATUS_LABELS[pedido.status] || { label: pedido.status, style: "" };
            return (
              <div key={pedido.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-slate-300">
                  #{pedido.numero}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {pedido.cliente_nome || "Cliente não identificado"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {TIPO_LABELS[pedido.tipo] || pedido.tipo} ·{" "}
                    {new Date(pedido.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.style}`}>
                  {status.label}
                </span>
                <span className="text-sm font-semibold text-white">
                  {pedido.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
