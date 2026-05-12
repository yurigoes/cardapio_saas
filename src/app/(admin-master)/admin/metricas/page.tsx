"use client";

/**
 * /admin/metricas — KPIs SaaS para o dono do produto.
 * Funnel, MRR/ARR, conversão, churn, crescimento, empresas em risco.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp, RefreshCw, AlertTriangle, Clock, Building2,
  CheckCircle2, XCircle, ArrowUpRight, Activity,
} from "lucide-react";

interface Funnel { total: number; ativas: number; teste: number; suspensas: number; canceladas: number; }
interface Financeiro { mrr: number; arr: number; empresas_pagantes: number; }
interface Conv { total: number; convertidas: number; pct: number; }
interface Conversao { d30: Conv; d60: Conv; d90: Conv; }
interface Churn { d30: number; d60: number; d90: number; }
interface TrialExp { id: string; nome_fantasia: string; email: string | null; trial_fim: string; dias_restantes: number; }
interface Risco { id: string; nome_fantasia: string; status: string; ultimo_pedido: string | null; dias_sem_pedido: number | null; }
interface Cresc { dia: string; novas: number; }
interface RankRow { id: string; nome_fantasia: string; status: string; pedidos_30d: number; receita_30d: number; }

interface Data {
  funnel:            Funnel;
  financeiro:        Financeiro;
  conversao:         Conversao;
  churn:             Churn;
  trials_expirando:  TrialExp[];
  empresas_em_risco: Risco[];
  crescimento:       Cresc[];
  ranking:           RankRow[];
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function AdminMetricasPage() {
  const [data, setData]       = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const t = localStorage.getItem("access_token");
      const r = await fetch("/api/admin/metricas", { headers: { Authorization: `Bearer ${t}` } });
      const j = await r.json();
      if (j.success) setData(j.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return <div className="py-16 text-center text-sm text-slate-500">Falha ao carregar métricas</div>;
  }

  // Max diário p/ chart
  const maxNovas = Math.max(1, ...data.crescimento.map(c => c.novas));

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            Métricas do produto
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Saúde do SaaS: funnel, receita, conversão, churn e empresas em risco
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Total",      value: data.funnel.total,      color: "text-white"        },
          { label: "Ativas",     value: data.funnel.ativas,     color: "text-emerald-400"  },
          { label: "Em trial",   value: data.funnel.teste,      color: "text-blue-400"     },
          { label: "Suspensas",  value: data.funnel.suspensas,  color: "text-amber-400"    },
          { label: "Canceladas", value: data.funnel.canceladas, color: "text-red-400"      },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
            <p className={`mt-1 text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* MRR / ARR */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400">MRR estimado</p>
          <p className="mt-1 text-3xl font-bold text-white">{fmtBRL(data.financeiro.mrr)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {data.financeiro.empresas_pagantes} empresa(s) pagante(s)
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400">ARR projetado</p>
          <p className="mt-1 text-3xl font-bold text-white">{fmtBRL(data.financeiro.arr)}</p>
          <p className="mt-1 text-xs text-slate-500">MRR × 12</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Ticket médio empresa</p>
          <p className="mt-1 text-3xl font-bold text-white">
            {data.financeiro.empresas_pagantes > 0
              ? fmtBRL(data.financeiro.mrr / data.financeiro.empresas_pagantes)
              : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">Mensal</p>
        </div>
      </div>

      {/* Conversão e churn */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Conversão Trial → Pagante</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: "Últimos 30 dias", v: data.conversao.d30 },
              { label: "Últimos 60 dias", v: data.conversao.d60 },
              { label: "Últimos 90 dias", v: data.conversao.d90 },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between gap-4">
                <span className="text-xs text-slate-400">{r.label}</span>
                <div className="flex items-baseline gap-2 text-right">
                  <span className="text-2xl font-bold text-emerald-400">{r.v.pct}%</span>
                  <span className="text-[11px] text-slate-500">
                    {r.v.convertidas}/{r.v.total}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="h-4 w-4 text-red-400" />
            <h3 className="text-sm font-semibold text-white">Churn (cancelamentos / suspensões)</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: "Últimos 30 dias", v: data.churn.d30 },
              { label: "Últimos 60 dias", v: data.churn.d60 },
              { label: "Últimos 90 dias", v: data.churn.d90 },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between gap-4">
                <span className="text-xs text-slate-400">{r.label}</span>
                <span className="text-2xl font-bold text-red-400">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Crescimento (chart de barras simples) */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Novas empresas (últimos 30 dias)</h3>
          <span className="ml-auto text-xs text-slate-500">
            Total: {data.crescimento.reduce((a, c) => a + c.novas, 0)}
          </span>
        </div>
        {data.crescimento.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">Sem novas empresas no período</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {data.crescimento.map(d => (
              <div key={d.dia} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  title={`${d.dia}: ${d.novas}`}
                  className="w-full bg-emerald-500/40 hover:bg-emerald-500/60 transition rounded-t"
                  style={{ height: `${(d.novas / maxNovas) * 100}%` }}
                />
                <span className="text-[8px] text-slate-600 group-hover:text-slate-400 transition">
                  {fmtDate(d.dia)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trials expirando */}
      {data.trials_expirando.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">
              Trials expirando em até 7 dias ({data.trials_expirando.length})
            </h3>
          </div>
          <div className="space-y-2">
            {data.trials_expirando.map(t => (
              <Link
                key={t.id}
                href={`/admin/empresas?q=${encodeURIComponent(t.nome_fantasia)}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2 hover:bg-white/10 transition"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{t.nome_fantasia}</p>
                  {t.email && <p className="text-[11px] text-slate-500 truncate">{t.email}</p>}
                </div>
                <span className={`text-xs font-bold whitespace-nowrap ${
                  t.dias_restantes <= 1 ? "text-red-400"
                  : t.dias_restantes <= 3 ? "text-amber-400" : "text-slate-400"
                }`}>
                  {t.dias_restantes <= 0 ? "Expira hoje" : `${t.dias_restantes}d`}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empresas em risco (sem pedido recente) */}
      {data.empresas_em_risco.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">
              Empresas inativas (sem pedidos há +7d)
            </h3>
          </div>
          <div className="space-y-2">
            {data.empresas_em_risco.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-2 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                  <span className="text-sm text-slate-300 truncate">{e.nome_fantasia}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    e.status === "teste" ? "bg-blue-500/15 text-blue-400" : "bg-emerald-500/15 text-emerald-400"
                  }`}>{e.status}</span>
                </div>
                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                  {e.dias_sem_pedido != null
                    ? `${e.dias_sem_pedido}d sem pedido`
                    : "nunca pediu"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ranking de receita 30d */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <ArrowUpRight className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Top 10 empresas — receita últimos 30d</h3>
        </div>
        {data.ranking.length === 0 || data.ranking.every(r => r.receita_30d === 0) ? (
          <p className="py-8 text-center text-xs text-slate-500">Sem dados de receita no período</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left px-2 py-2">Empresa</th>
                  <th className="text-right px-2 py-2">Pedidos</th>
                  <th className="text-right px-2 py-2">Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.ranking.map((r, i) => (
                  <tr key={r.id} className="hover:bg-white/5">
                    <td className="px-2 py-2">
                      <span className="text-slate-500 mr-2">#{i + 1}</span>
                      <span className="text-white">{r.nome_fantasia}</span>
                    </td>
                    <td className="text-right px-2 py-2 text-slate-300 font-mono">{r.pedidos_30d}</td>
                    <td className="text-right px-2 py-2 text-emerald-400 font-mono font-semibold">
                      {fmtBRL(r.receita_30d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
