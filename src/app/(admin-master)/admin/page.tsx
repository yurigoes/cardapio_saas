"use client";

/**
 * /admin — Cockpit master cross-tenant
 *
 * Visão consolidada do dono do SaaS:
 *   - KPIs gerais (empresas, usuários, pedidos, receita)
 *   - Empresas com problemas (alertas)
 *   - Top 10 empresas por volume
 *   - Gráfico de atividade 24h
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Building2, Users, TrendingUp, Package, Activity, AlertTriangle,
  DollarSign, ChevronRight, RefreshCw, Trophy, Calendar, ExternalLink,
} from "lucide-react";

interface DashboardData {
  kpis: {
    total_empresas:     number;
    empresas_ativas:    number;
    empresas_novas_mes: number;
    total_usuarios:     number;
    pedidos_mes:        number;
    pedidos_hoje:       number;
    receita_mes:        number;
    receita_hoje:       number;
    novos_clientes_mes: number;
  };
  top_empresas: Array<{
    id: string; nome_fantasia: string; slug: string; status: string;
    pedidos_mes: number; receita_mes: number;
  }>;
  alertas: Array<{
    id: string; nome_fantasia: string; status: string;
    assinatura_expira_em: string | null;
    dias_para_expirar: number | null;
  }>;
  atividade: Array<{ hora: string; total: number }>;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}h`;
}
function fmtDateShort(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

const STATUS_COLOR: Record<string, string> = {
  ativo:     "bg-emerald-500/15 text-emerald-400",
  suspenso:  "bg-amber-500/15 text-amber-400",
  bloqueado: "bg-red-500/15 text-red-400",
  trial:     "bg-blue-500/15 text-blue-400",
  inativo:   "bg-slate-500/15 text-slate-400",
};

export default function AdminMasterDashboard() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    const res  = await fetch("/api/admin/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.success) setData(json.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);
  useEffect(() => {
    const id = setInterval(fetchDashboard, 60_000);
    return () => clearInterval(id);
  }, [fetchDashboard]);

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const maxAtividade = Math.max(1, ...data.atividade.map(a => a.total));

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Master Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Visão consolidada de todas as empresas
          </p>
        </div>
        <button
          onClick={fetchDashboard}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Building2} label="Empresas ativas" value={String(data.kpis.empresas_ativas)}
             color="text-emerald-400" sub={`${data.kpis.total_empresas} total · ${data.kpis.empresas_novas_mes} novas mês`} />
        <Kpi icon={Users}     label="Usuários"        value={String(data.kpis.total_usuarios)}
             color="text-violet-400" />
        <Kpi icon={Package}   label="Pedidos do mês"  value={data.kpis.pedidos_mes.toLocaleString("pt-BR")}
             color="text-amber-400"  sub={`${data.kpis.pedidos_hoje} hoje`} />
        <Kpi icon={DollarSign} label="Receita do mês" value={fmtBRL(data.kpis.receita_mes)}
             color="text-emerald-400" sub={`${fmtBRL(data.kpis.receita_hoje)} hoje`} hero />
      </div>

      {/* Alertas */}
      {data.alertas.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Empresas com alertas ({data.alertas.length})
          </h2>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5">
            <div className="divide-y divide-white/5">
              {data.alertas.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                      <Building2 className="h-4 w-4 text-slate-300" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{e.nome_fantasia}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLOR[e.status] ?? "bg-slate-500/15 text-slate-400"}`}>
                          {e.status}
                        </span>
                        {e.dias_para_expirar != null && (
                          <span className={`text-[11px] ${
                            e.dias_para_expirar <= 0 ? "text-red-400" :
                            e.dias_para_expirar <= 3 ? "text-amber-300" : "text-slate-400"
                          }`}>
                            <Calendar className="inline h-3 w-3" />{" "}
                            {e.dias_para_expirar <= 0
                              ? `expirou ${fmtDateShort(e.assinatura_expira_em)}`
                              : `expira em ${e.dias_para_expirar}d (${fmtDateShort(e.assinatura_expira_em)})`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/admin/empresas`}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5 transition"
                  >
                    Gerenciar <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Gráfico de atividade 24h */}
      {data.atividade.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Activity className="h-4 w-4 text-blue-400" />
            Atividade nas últimas 24h
            <span className="text-xs font-normal text-slate-500">
              ({data.atividade.reduce((a, b) => a + b.total, 0)} pedidos)
            </span>
          </h2>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-32 items-end gap-1">
              {data.atividade.map((a) => {
                const pct = (a.total / maxAtividade) * 100;
                return (
                  <div
                    key={a.hora}
                    className="flex-1 group relative flex flex-col items-center justify-end"
                    title={`${fmtDateTime(a.hora)}: ${a.total} pedidos`}
                  >
                    <div
                      className="w-full rounded-t bg-emerald-500 transition-all hover:brightness-125"
                      style={{ height: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[9px] text-slate-500">
              <span>{fmtDateTime(data.atividade[0]?.hora)}</span>
              <span>{fmtDateTime(data.atividade[data.atividade.length - 1]?.hora)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Top 10 empresas */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Trophy className="h-4 w-4 text-amber-400" />
          Top 10 empresas (mês)
        </h2>
        <div className="rounded-2xl border border-white/10 bg-white/5">
          {data.top_empresas.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Sem atividade no mês</p>
          ) : (
            <div className="divide-y divide-white/5">
              {data.top_empresas.map((e, i) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0 ? "bg-amber-500/20 text-amber-300" :
                      i === 1 ? "bg-slate-400/20 text-slate-300" :
                      i === 2 ? "bg-amber-700/20 text-amber-500" :
                                "bg-white/5 text-slate-500"
                    }`}>
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{e.nome_fantasia}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLOR[e.status] ?? "bg-slate-500/15 text-slate-400"}`}>
                          {e.status}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">{e.slug}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{fmtBRL(e.receita_mes)}</p>
                      <p className="text-[10px] text-slate-500">{e.pedidos_mes} pedidos</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Atalhos */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "Empresas",   icon: Building2,    href: "/admin/empresas"   },
          { label: "Planos",     icon: Package,      href: "/admin/planos"     },
          { label: "Usuários",   icon: Users,        href: "/admin/usuarios"   },
          { label: "Financeiro", icon: TrendingUp,   href: "/admin/financeiro" },
          { label: "Auditoria",  icon: Activity,     href: "/admin/auditoria"  },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-xs font-medium text-slate-300 hover:bg-white/10 transition"
            >
              <Icon className="h-4 w-4 text-slate-400" />
              {s.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, color, sub, hero,
}: {
  icon: React.ElementType; label: string; value: string;
  color: string; sub?: string; hero?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-4 ${hero ? "ring-1 ring-emerald-500/20" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-500 truncate">{sub}</p>}
    </div>
  );
}
