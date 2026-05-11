"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  RefreshCw,
  Search,
  Truck,
  XCircle
} from "lucide-react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API || "https://connect.yugochat.com.br";

type Pedido = {
  Id: number;
  numero_pedido?: string | number;
  cliente_nome?: string;
  cliente_telefone?: string;
  status?: string;
  total?: number;
  subtotal?: number;
  taxa_servico?: number;
  forma_pagamento?: string;
  origem?: string;
  itens_json?: string;
  observacao?: string;
  created_at?: string;
  CreatedAt?: string;
  criado_em?: string;
};

const statusTabs = [
  { id: "todos", label: "Todos" },
  { id: "Novo", label: "Novo" },
  { id: "Recebido", label: "Recebido" },
  { id: "Em preparo", label: "Em preparo" },
  { id: "Pronto", label: "Pronto" },
  { id: "Entregue", label: "Entregue" },
  { id: "Cancelado", label: "Cancelado" }
];

function money(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function parseItens(value?: string) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getPedidoDate(pedido: Pedido) {
  return (
    pedido.criado_em ||
    pedido.created_at ||
    pedido.CreatedAt ||
    new Date().toISOString()
  );
}

function minutesAgo(pedido: Pedido) {
  const date = new Date(getPedidoDate(pedido)).getTime();
  const now = Date.now();

  if (Number.isNaN(date)) return 0;

  return Math.max(Math.floor((now - date) / 60000), 0);
}

function statusStyle(status?: string) {
  const s = String(status || "Novo").toLowerCase();

  if (s.includes("preparo")) {
    return "border-orange-400/40 bg-orange-500/10 text-orange-300";
  }

  if (s.includes("pronto")) {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-300";
  }

  if (s.includes("entregue")) {
    return "border-blue-400/40 bg-blue-500/10 text-blue-300";
  }

  if (s.includes("cancel")) {
    return "border-red-400/40 bg-red-500/10 text-red-300";
  }

  return "border-[var(--primary-color)]/50 bg-white/[0.04] text-[var(--primary-color)]";
}

export default function Pedidos({ empresaId }: { empresaId: string | number }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  async function loadPedidos() {
    try {
      setLoading(true);

      const res = await fetch(
        `${API}/api/db/pedidos_cardapio?where=(empresa_id,eq,${empresaId})&limit=500`,
        { cache: "no-store" }
      );

      const data = await res.json();
      setPedidos(data.list || []);
    } catch (error) {
      console.error("Erro ao carregar pedidos:", error);
    } finally {
      setLoading(false);
    }
  }

  async function mudarStatus(pedido: Pedido, novoStatus: string) {
    try {
      setUpdatingId(pedido.Id);

      const res = await fetch(`${API}/api/db/pedidos_cardapio/${pedido.Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: novoStatus
        })
      });

      if (!res.ok) {
        alert(`Erro ao alterar status: ${await res.text()}`);
        return;
      }

      setPedidos((current) =>
        current.map((item) =>
          item.Id === pedido.Id ? { ...item, status: novoStatus } : item
        )
      );
    } finally {
      setUpdatingId(null);
    }
  }

  useEffect(() => {
    loadPedidos();

    const interval = setInterval(loadPedidos, 7000);

    return () => clearInterval(interval);
  }, [empresaId]);

  const pedidosFiltrados = useMemo(() => {
    return pedidos
      .filter((pedido) => {
        const matchStatus =
          status === "todos" || String(pedido.status || "Novo") === status;

        const termo = busca.toLowerCase();

        const matchBusca =
          !termo ||
          String(pedido.numero_pedido || "").toLowerCase().includes(termo) ||
          String(pedido.cliente_nome || "").toLowerCase().includes(termo) ||
          String(pedido.cliente_telefone || "").toLowerCase().includes(termo);

        return matchStatus && matchBusca;
      })
      .sort((a, b) => Number(b.Id) - Number(a.Id));
  }, [pedidos, status, busca]);

  const resumo = useMemo(() => {
    const ativos = pedidos.filter(
      (p) =>
        !["Entregue", "Cancelado"].includes(String(p.status || "Novo"))
    );

    return {
      total: pedidos.length,
      ativos: ativos.length,
      preparo: pedidos.filter((p) => p.status === "Em preparo").length,
      pronto: pedidos.filter((p) => p.status === "Pronto").length
    };
  }, [pedidos]);

  return (
    <div className="min-h-screen text-white">
      <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p
            className="text-xs font-black uppercase tracking-[0.45em]"
            style={{ color: "var(--primary-color)" }}
          >
            Operação
          </p>

          <h1 className="mt-2 font-serif text-4xl tracking-wide">Pedidos</h1>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Realtime ativo
          </div>
        </div>

        <button
          onClick={loadPedidos}
          className="flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 font-bold text-zinc-300 transition hover:bg-white/10"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
            Total
          </p>
          <strong className="mt-2 block font-serif text-3xl">
            {resumo.total}
          </strong>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
            Ativos
          </p>
          <strong
            className="mt-2 block font-serif text-3xl"
            style={{ color: "var(--primary-color)" }}
          >
            {resumo.ativos}
          </strong>
        </div>

        <div className="rounded-[1.5rem] border border-orange-400/20 bg-orange-500/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">
            Em preparo
          </p>
          <strong className="mt-2 block font-serif text-3xl">
            {resumo.preparo}
          </strong>
        </div>

        <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
            Prontos
          </p>
          <strong className="mt-2 block font-serif text-3xl">
            {resumo.pronto}
          </strong>
        </div>
      </section>

      <section className="mb-6 grid gap-3 xl:grid-cols-[1fr_auto]">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4">
          <Search size={18} className="text-zinc-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por pedido, cliente ou telefone..."
            className="h-14 flex-1 bg-transparent text-sm outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatus(tab.id)}
              className={`rounded-full border px-4 py-3 text-xs font-black uppercase tracking-[0.18em] transition ${
                status === tab.id
                  ? "text-black"
                  : "border-white/10 text-zinc-400 hover:text-white"
              }`}
              style={{
                background:
                  status === tab.id ? "var(--primary-color)" : undefined,
                borderColor:
                  status === tab.id ? "var(--primary-color)" : undefined
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-10 text-center text-zinc-400">
          Carregando pedidos...
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-10 text-center text-zinc-400">
          Nenhum pedido encontrado.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {pedidosFiltrados.map((pedido) => {
            const itens = parseItens(pedido.itens_json);
            const minutos = minutesAgo(pedido);
            const atrasado =
              !["Entregue", "Cancelado"].includes(
                String(pedido.status || "Novo")
              ) && minutos >= 15;

            return (
              <article
                key={pedido.Id}
                className={`overflow-hidden rounded-[1.8rem] border bg-gradient-to-b from-zinc-900/90 to-black shadow-xl transition ${
                  atrasado
                    ? "border-red-400/50 ring-2 ring-red-500/20"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-start justify-between gap-5 border-b border-white/10 p-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-serif text-3xl">
                        #{pedido.numero_pedido || pedido.Id}
                      </h2>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${statusStyle(
                          pedido.status
                        )}`}
                      >
                        {pedido.status || "Novo"}
                      </span>

                      {atrasado && (
                        <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1 text-xs font-black uppercase text-red-300">
                          <Bell size={13} />
                          Atrasado
                        </span>
                      )}
                    </div>

                    <p className="mt-3 text-zinc-300">
                      {pedido.cliente_nome || "Cliente"} ·{" "}
                      {pedido.cliente_telefone || "sem telefone"}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Clock size={13} />
                        há {minutos} min
                      </span>

                      <span className="flex items-center gap-1">
                        <Truck size={13} />
                        {pedido.origem || "Cardápio Digital"}
                      </span>

                      <span className="flex items-center gap-1">
                        <CreditCard size={13} />
                        {pedido.forma_pagamento || "Pagamento"}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p
                      className="font-serif text-2xl"
                      style={{ color: "var(--primary-color)" }}
                    >
                      {money(Number(pedido.total || pedido.subtotal || 0))}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 p-6">
                  {itens.length === 0 ? (
                    <div className="rounded-2xl bg-white/[0.03] p-4 text-sm text-zinc-500">
                      Itens não informados neste pedido.
                    </div>
                  ) : (
                    itens.map((item: any, index: number) => (
                      <div
                        key={`${item.Id || item.nome}-${index}`}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      >
                        <div className="flex justify-between gap-4">
                          <div>
                            <p className="font-black text-white">
                              {Number(item.quantidade || 1)}x {item.nome}
                            </p>

                            {item.observacao && (
                              <p className="mt-1 text-xs text-yellow-200">
                                Obs: {item.observacao}
                              </p>
                            )}
                          </div>

                          <strong
                            className="whitespace-nowrap"
                            style={{ color: "var(--primary-color)" }}
                          >
                            {money(
                              Number(item.preco || 0) *
                                Number(item.quantidade || 1)
                            )}
                          </strong>
                        </div>

                        {!!item.insumos?.length && (
                          <div className="mt-3 rounded-xl bg-black/30 p-3 text-sm text-zinc-400">
                            <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                              Adicionais
                            </p>

                            {item.insumos.map((insumo: any, idx: number) => (
                              <div
                                key={`${insumo.Id || insumo.nome}-${idx}`}
                                className="flex justify-between gap-3"
                              >
                                <span>
                                  + {insumo.nome}
                                  {insumo.quantidade
                                    ? ` (${insumo.quantidade}x)`
                                    : ""}
                                </span>

                                <span>{money(Number(insumo.preco || 0))}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {pedido.observacao && (
                    <div className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-4 text-sm text-yellow-100">
                      <strong>Observação do pedido:</strong>{" "}
                      {pedido.observacao}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-white/10 p-6">
                  <button
                    disabled={updatingId === pedido.Id}
                    onClick={() => mudarStatus(pedido, "Em preparo")}
                    className="rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm font-black text-orange-300 transition hover:bg-orange-500/20 disabled:opacity-50"
                  >
                    → Em preparo
                  </button>

                  <button
                    disabled={updatingId === pedido.Id}
                    onClick={() => mudarStatus(pedido, "Pronto")}
                    className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    <CheckCircle2 size={15} className="inline-block" /> Pronto
                  </button>

                  <button
                    disabled={updatingId === pedido.Id}
                    onClick={() => mudarStatus(pedido, "Entregue")}
                    className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm font-black text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-50"
                  >
                    → Entregue
                  </button>

                  <button
                    disabled={updatingId === pedido.Id}
                    onClick={() => mudarStatus(pedido, "Cancelado")}
                    className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-black text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    <XCircle size={15} className="inline-block" /> Cancelar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}