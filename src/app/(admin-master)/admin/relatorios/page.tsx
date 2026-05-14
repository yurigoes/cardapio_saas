"use client";

import { useEffect, useState } from "react";
import MasterShell from "@/components/admin/MasterShell";
import { BarChart3, TrendingUp, RefreshCw } from "lucide-react";

interface Stats {
  total_empresas: number;
  total_pedidos: number;
  total_usuarios: number;
  pedidos_30d: number;
  gmv_30d: number;
  empresas_novas_30d: number;
}

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminRelatoriosPage() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${t}` } });
      const d = await r.json();
      if (d.success) setStats(d.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  return (
    <MasterShell>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
              <BarChart3 className="h-5 w-5 text-emerald-400" /> Relatórios
            </h1>
            <p className="text-sm text-slate-400">Visão geral de uso da plataforma</p>
          </div>
          <button onClick={carregar}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
            <RefreshCw className={`h-3.5 w-3.5 inline ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card titulo="Total empresas" valor={stats?.total_empresas} cor="text-emerald-400" />
          <Card titulo="Total pedidos" valor={stats?.total_pedidos} cor="text-blue-400" />
          <Card titulo="Total usuários" valor={stats?.total_usuarios} cor="text-purple-400" />
          <Card titulo="Pedidos últimos 30d" valor={stats?.pedidos_30d} cor="text-amber-400" />
          <Card titulo="GMV últimos 30d" valor={stats ? fmtBRL(stats.gmv_30d) : null} cor="text-emerald-400" />
          <Card titulo="Novas empresas 30d" valor={stats?.empresas_novas_30d} cor="text-pink-400" />
        </div>

        <p className="text-xs text-slate-500 italic">
          Para relatórios detalhados por empresa, acesse <a href="/admin/empresas" className="text-emerald-400 underline">/admin/empresas</a> → Gerenciar → Diagnóstico.
        </p>
      </div>
    </MasterShell>
  );
}

function Card({ titulo, valor, cor }: { titulo: string; valor: number | string | null | undefined; cor: string }) {
  const display = valor == null ? "—"
                : typeof valor === "number" ? valor.toLocaleString("pt-BR")
                : valor;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className={`h-4 w-4 ${cor}`} />
        <span className="text-xs uppercase font-semibold text-slate-500">{titulo}</span>
      </div>
      <p className={`text-3xl font-bold ${cor}`}>{display}</p>
    </div>
  );
}
