"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, AlertTriangle, Building2, Calendar, RefreshCw } from "lucide-react";

interface Resumo {
  mrr_estimado: number;
  total_empresas_ativas: number;
  por_status: { status: string; total: number }[];
  trials_ativos: number;
  compras_modulos: { total_30d: number; pago_30d: number; valor_30d: number };
  vencendo_7d: { id: string; nome_fantasia: string; assinatura_expira_em: string }[];
}

const fmtBRL = (n: number | null | undefined) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};
const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export default function AdminFinanceiroPage() {
  const [data, setData]       = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch("/api/admin/financeiro", { headers: { Authorization: `Bearer ${t}` } });
      const d = await r.json();
      if (d.success) setData(d.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  return (
    <div className="space-y-6 max-w-5xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
              <DollarSign className="h-5 w-5 text-emerald-400" /> Financeiro
            </h1>
            <p className="text-sm text-slate-400">Receita, assinaturas e cobranças do SaaS</p>
          </div>
          <button onClick={carregar}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
            <RefreshCw className={`h-3.5 w-3.5 inline ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        {/* KPIs */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card titulo="MRR estimado" valor={data ? fmtBRL(data.mrr_estimado) : "—"}
            sub={`${data?.total_empresas_ativas ?? "—"} empresas`} cor="text-emerald-400" icon={TrendingUp} />
          <Card titulo="Trials ativos" valor={String(data?.trials_ativos ?? "—")}
            sub="14 dias grátis" cor="text-blue-400" icon={Calendar} />
          <Card titulo="Compras módulos 30d" valor={String(data?.compras_modulos.total_30d ?? "—")}
            sub={`${data?.compras_modulos.pago_30d ?? 0} pagas`} cor="text-purple-400" icon={DollarSign} />
          <Card titulo="Faturado módulos 30d" valor={data ? fmtBRL(data.compras_modulos.valor_30d) : "—"}
            sub="à la carte" cor="text-amber-400" icon={DollarSign} />
        </div>

        {/* Por status */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="font-bold text-white mb-3">Empresas por status</h3>
          {data?.por_status?.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {data.por_status.map(s => (
                <div key={s.status} className="rounded-xl bg-slate-900/50 p-3">
                  <p className="text-xs text-slate-500">{s.status}</p>
                  <p className="text-2xl font-bold text-white">{s.total.toLocaleString("pt-BR")}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">{loading ? "Carregando..." : "Sem dados"}</p>}
        </section>

        {/* Vencendo */}
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h3 className="font-bold text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Empresas vencendo nos próximos 7 dias
          </h3>
          {data?.vencendo_7d?.length ? (
            <div className="space-y-2">
              {data.vencendo_7d.map(e => (
                <a key={e.id} href={`/admin/empresas/${e.id}/gerenciar`}
                  className="flex items-center justify-between rounded-lg bg-slate-900/50 p-3 hover:bg-slate-900/80">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span className="font-bold text-white">{e.nome_fantasia}</span>
                  </div>
                  <span className="text-sm text-amber-300">expira em {fmtData(e.assinatura_expira_em)}</span>
                </a>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Nenhuma empresa vencendo no período 🎉</p>}
        </section>
      </div>);
}

function Card({ titulo, valor, sub, cor, icon: Icon }: { titulo: string; valor: string; sub: string; cor: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{titulo}</span>
        <Icon className={`h-4 w-4 ${cor}`} />
      </div>
      <p className={`text-xl font-bold ${cor}`}>{valor}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  );
}
