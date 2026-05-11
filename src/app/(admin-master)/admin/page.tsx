"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Users, TrendingUp, Package, Activity, AlertTriangle } from "lucide-react";

interface DashboardStats {
  total_empresas:  number;
  empresas_ativas: number;
  total_usuarios:  number;
  total_pedidos:   number;
  receita_mes:     number;
  alertas:         number;
}

interface EmpresaRecente {
  id:           string;
  nome_fantasia: string;
  status:       string;
  plano_nome:   string;
  created_at:   string;
}

const STAT_CARDS = [
  { key: "total_empresas",  label: "Total de Empresas", icon: Building2, color: "blue"    },
  { key: "empresas_ativas", label: "Empresas Ativas",   icon: Activity,  color: "emerald" },
  { key: "total_usuarios",  label: "Usuários",          icon: Users,     color: "violet"  },
  { key: "total_pedidos",   label: "Pedidos (mês)",     icon: Package,   color: "amber"   },
] as const;

const COLOR_MAP = {
  blue:    "bg-blue-500/15 text-blue-400",
  emerald: "bg-emerald-500/15 text-emerald-400",
  violet:  "bg-violet-500/15 text-violet-400",
  amber:   "bg-amber-500/15 text-amber-400",
};

export default function AdminDashboard() {
  const [stats, setStats]          = useState<DashboardStats | null>(null);
  const [empresas, setEmpresas]    = useState<EmpresaRecente[]>([]);
  const [loading, setLoading]      = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    Promise.all([
      fetch("/api/admin/stats",    { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch("/api/admin/empresas?limit=5&page=1", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([statsData, empresasData]) => {
      if (statsData.success)   setStats(statsData.data);
      if (empresasData.success) setEmpresas(empresasData.data);
    }).finally(() => setLoading(false));
  }, []);

  const STATUS_STYLE: Record<string, string> = {
    ativo:     "bg-emerald-500/15 text-emerald-400",
    inativo:   "bg-slate-500/15 text-slate-400",
    suspenso:  "bg-red-500/15 text-red-400",
    teste:     "bg-amber-500/15 text-amber-400",
    bloqueado: "bg-red-500/20 text-red-500",
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard Master</h1>
        <p className="mt-1 text-sm text-slate-400">Visão geral da plataforma</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT_CARDS.map((card, i) => {
          const Icon  = card.icon;
          const value = stats?.[card.key] ?? 0;

          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${COLOR_MAP[card.color]}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-2xl font-bold text-white">
                {value.toLocaleString("pt-BR")}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{card.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Receita + Alertas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <p className="text-sm font-medium text-slate-300">Receita do Mês</p>
          </div>
          <p className="mt-2 text-3xl font-bold text-white">
            {(stats?.receita_mes ?? 0).toLocaleString("pt-BR", {
              style: "currency", currency: "BRL",
            })}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-medium text-amber-300">Alertas</p>
          </div>
          <p className="mt-2 text-3xl font-bold text-white">
            {stats?.alertas ?? 0}
          </p>
          <p className="mt-0.5 text-xs text-amber-400/70">
            Empresas com licença expirando ou suspensas
          </p>
        </div>
      </div>

      {/* Empresas Recentes */}
      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="border-b border-white/5 px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Empresas Recentes</h2>
        </div>

        <div className="divide-y divide-white/5">
          {empresas.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              Nenhuma empresa encontrada
            </p>
          )}

          {empresas.map((empresa) => (
            <div key={empresa.id} className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm font-medium text-white">{empresa.nome_fantasia}</p>
                <p className="text-xs text-slate-400">
                  Plano: {empresa.plano_nome || "—"} · Criado{" "}
                  {new Date(empresa.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[empresa.status] || ""}`}>
                {empresa.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
