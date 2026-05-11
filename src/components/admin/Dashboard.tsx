"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, PackageCheck, RefreshCw, ShoppingBag, TrendingUp } from "lucide-react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type Pedido = {
  Id: number;
  status?: string;
  total?: number | string;
  criado_em?: string;
  origem?: string;
  forma_pagamento?: string;
};

function money(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function isHoje(value?: string) {
  if (!value) return false;

  const d = new Date(String(value).replace(" ", "T"));
  const hoje = new Date();

  return (
    d.getFullYear() === hoje.getFullYear() &&
    d.getMonth() === hoje.getMonth() &&
    d.getDate() === hoje.getDate()
  );
}

export default function Dashboard({ empresaId }: { empresaId?: string }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    if (!empresaId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErro("");

      const res = await fetch(
        `${API}/api/cardapio/cozinha/${empresaId}/pedidos?status=Todos`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Erro ao carregar dashboard.");

      setPedidos(Array.isArray(data?.pedidos) ? data.pedidos : []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [empresaId]);

  const resumo = useMemo(() => {
    const pedidosHoje = pedidos.filter((p) => isHoje(p.criado_em));
    const faturamentoHoje = pedidosHoje
      .filter((p) => p.status !== "Cancelado")
      .reduce((sum, p) => sum + Number(p.total || 0), 0);

    const faturamentoTotal = pedidos
      .filter((p) => p.status !== "Cancelado")
      .reduce((sum, p) => sum + Number(p.total || 0), 0);

    const pedidosAtivos = pedidos.filter((p) =>
      ["Recebido", "Em preparo", "Pronto"].includes(String(p.status || ""))
    ).length;

    const ticketMedio =
      pedidosHoje.length > 0 ? faturamentoHoje / pedidosHoje.length : 0;

    return {
      faturamentoHoje,
      ticketMedio,
      faturamentoTotal,
      pedidosAtivos,
      pedidosHoje: pedidosHoje.length,
      cancelados: pedidos.filter((p) => p.status === "Cancelado").length,
    };
  }, [pedidos]);

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">Visão geral</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Indicadores operacionais e financeiros da empresa.
          </p>
        </div>

        <button
          type="button"
          onClick={carregar}
          className="flex w-fit items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/20"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </header>

      {erro && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
          {erro}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card icon={TrendingUp} label="Faturamento hoje" value={money(resumo.faturamentoHoje)} />
        <Card icon={ShoppingBag} label="Ticket médio" value={money(resumo.ticketMedio)} />
        <Card icon={PackageCheck} label="Faturamento total" value={money(resumo.faturamentoTotal)} />
        <Card icon={Clock3} label="Pedidos ativos" value={resumo.pedidosAtivos} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-black">Resumo do dia</h2>
          <div className="mt-4 space-y-3 text-sm text-zinc-300">
            <Linha label="Pedidos hoje" value={resumo.pedidosHoje} />
            <Linha label="Pedidos ativos" value={resumo.pedidosAtivos} />
            <Linha label="Cancelados" value={resumo.cancelados} />
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 xl:col-span-2">
          <h2 className="text-xl font-black">Próximos indicadores</h2>
          <p className="mt-3 text-sm text-zinc-400">
            Esta área será preparada para gráficos de vendas por horário, produtos mais vendidos,
            recorrência de clientes e conversão de cupons.
          </p>
        </div>
      </div>
    </section>
  );
}

function Card({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <Icon className="h-5 w-5 text-emerald-300" />
      <p className="mt-4 text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function Linha({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-black/30 px-4 py-3">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
