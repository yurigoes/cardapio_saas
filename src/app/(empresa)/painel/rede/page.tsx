"use client";

/**
 * /painel/rede — Dashboard consolidado da rede.
 * Mostra métricas agregadas de TODAS filiais + breakdown por filial + top produtos.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Network, Building2, TrendingUp, Users, Package, ShoppingBag,
  Loader2, DollarSign, BarChart3, Star, RefreshCw,
} from "lucide-react";

interface Dashboard {
  periodo: string;
  totais: {
    total_pedidos: number; total_faturado: number; ticket_medio: number;
    total_clientes: number; total_produtos: number;
  };
  filiais: Array<{
    empresa_id: string; nome_fantasia: string; nome_filial: string | null;
    is_matriz: boolean; pedidos: string; faturado: string; ticket_medio: string;
  }>;
  top_produtos: Array<{ produto_id: string; nome: string; qtd: string; faturado: string }>;
  por_dia: Array<{ dia: string; pedidos: string; faturado: string }>;
}

const fmtBRL = (n: number | string) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function DashboardRede() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [periodo, setPeriodo] = useState<"7d"|"30d"|"mes_atual"|"mes_anterior">("30d");
  const [loading, setLoading] = useState(true);
  const [semRede, setSemRede] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const t = localStorage.getItem("access_token");
      const r = await fetch(`/api/painel/rede/dashboard?periodo=${periodo}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const d = await r.json();
      if (!d.success) {
        if (d.error?.includes("rede")) setSemRede(true);
        return;
      }
      setData(d.data);
    } finally { setLoading(false); }
  }, [periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  if (semRede) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <Network className="h-12 w-12 text-slate-600 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-white">Esta empresa não pertence a uma rede</h1>
        <p className="mt-2 text-sm text-slate-400">
          Peça ao master cadastrar uma rede em <code>/admin/redes</code> e vincular esta empresa como filial
          pra ver dashboard consolidado, transferências e cardápio compartilhado.
        </p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  const maxFat = Math.max(...data.por_dia.map(d => Number(d.faturado)), 1);

  return (
    <div className="space-y-6 max-w-7xl pb-12">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard da rede</h1>
            <p className="text-xs text-slate-400">Métricas consolidadas de todas filiais</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={periodo} onChange={e => setPeriodo(e.target.value as typeof periodo)}
            className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white">
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="mes_atual">Mês atual</option>
            <option value="mes_anterior">Mês anterior</option>
          </select>
          <button onClick={carregar} className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/5">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Cards totais */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card label="Pedidos"     valor={data.totais.total_pedidos.toLocaleString("pt-BR")} icon={ShoppingBag} cor="emerald" />
        <Card label="Faturamento" valor={fmtBRL(data.totais.total_faturado)} icon={DollarSign} cor="blue" />
        <Card label="Ticket médio" valor={fmtBRL(data.totais.ticket_medio)} icon={TrendingUp} cor="amber" />
        <Card label="Clientes"    valor={data.totais.total_clientes.toLocaleString("pt-BR")} icon={Users} cor="purple" />
        <Card label="Produtos"    valor={data.totais.total_produtos.toLocaleString("pt-BR")} icon={Package} cor="cyan" />
      </div>

      {/* Gráfico simples — pedidos/dia */}
      {data.por_dia.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300">
            <BarChart3 className="h-4 w-4" /> Faturamento por dia
          </h2>
          <div className="flex items-end gap-1 h-32">
            {data.por_dia.map(d => {
              const h = (Number(d.faturado) / maxFat) * 100;
              return (
                <div key={d.dia} className="flex-1 flex flex-col items-center" title={`${d.dia}: ${fmtBRL(d.faturado)}`}>
                  <div className="w-full rounded-t bg-emerald-500/30 hover:bg-emerald-500/60 transition"
                    style={{ height: `${Math.max(h, 2)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>{new Date(data.por_dia[0]?.dia).toLocaleDateString("pt-BR")}</span>
            <span>{new Date(data.por_dia[data.por_dia.length-1]?.dia).toLocaleDateString("pt-BR")}</span>
          </div>
        </section>
      )}

      {/* Breakdown por filial */}
      <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="border-b border-white/10 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Filiais ({data.filiais.length})
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-white/5 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Filial</th>
              <th className="px-4 py-2 text-right">Pedidos</th>
              <th className="px-4 py-2 text-right">Faturamento</th>
              <th className="px-4 py-2 text-right">Ticket médio</th>
            </tr>
          </thead>
          <tbody>
            {data.filiais.map(f => (
              <tr key={f.empresa_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-emerald-400" />
                    <div>
                      <p className="font-bold text-white">{f.nome_filial ?? f.nome_fantasia}</p>
                      {f.nome_filial && <p className="text-[10px] text-slate-500">{f.nome_fantasia}</p>}
                    </div>
                    {f.is_matriz && (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">★ MATRIZ</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-white">{Number(f.pedidos).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmtBRL(f.faturado)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-400">{fmtBRL(f.ticket_medio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Top produtos */}
      {data.top_produtos.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="border-b border-white/10 p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300">
              <Star className="h-4 w-4" /> Top 10 produtos da rede
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-white/5 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Produto</th>
                <th className="px-4 py-2 text-right">Qtd vendida</th>
                <th className="px-4 py-2 text-right">Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {data.top_produtos.map((p, i) => (
                <tr key={p.produto_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-bold text-slate-500">#{i+1}</td>
                  <td className="px-4 py-2 text-white">{p.nome}</td>
                  <td className="px-4 py-2 text-right font-mono text-white">{Number(p.qtd).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-2 text-right font-mono text-emerald-400">{fmtBRL(p.faturado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Card({ label, valor, icon: Icon, cor }: {
  label: string; valor: string; icon: React.ComponentType<{ className?: string }>; cor: string;
}) {
  const cores: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
    blue:    "border-blue-500/30 bg-blue-500/5 text-blue-400",
    amber:   "border-amber-500/30 bg-amber-500/5 text-amber-400",
    purple:  "border-purple-500/30 bg-purple-500/5 text-purple-400",
    cyan:    "border-cyan-500/30 bg-cyan-500/5 text-cyan-400",
  };
  return (
    <div className={`rounded-2xl border p-4 ${cores[cor]?.split(" ").slice(0, 2).join(" ")}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${cores[cor]?.split(" ")[2]}`} />
        <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold text-white">{valor}</p>
    </div>
  );
}
