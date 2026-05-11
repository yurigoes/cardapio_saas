"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChefHat,
  Clock3,
  Filter,
  History,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  X,
  XCircle,
} from "lucide-react";
import PedidoEventosModal from "@/components/admin/PedidoEventosModal";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type PedidoStatus =
  | "Todos"
  | "Recebido"
  | "Em preparo"
  | "Pronto"
  | "Entregue"
  | "Cancelado";

type KdsItem = {
  Id?: number;
  pedido_id?: number | string;
  produto_id?: number | string;
  nome_produto?: string;
  nome?: string;
  quantidade?: number | string;
  preco_unitario?: number | string;
  subtotal?: number | string;
  insumos_json?: string;
  insumos?: Array<{
    Id?: number;
    nome: string;
    preco?: number | string;
    quantidade?: number | string;
  }>;
  observacao?: string;
  status?: string;
  setor?: string;
  setor_impressao?: string;
  criado_em?: string;
};

type Pedido = {
  Id: number;
  numero_pedido?: string;
  empresa_id?: number | string;
  cliente_nome?: string;
  cliente_telefone?: string;
  mesa?: string;
  origem?: string;
  status?: PedidoStatus | string;
  forma_pagamento?: string;
  status_pagamento?: string;
  total?: number | string;
  observacao?: string;
  criado_em?: string;
  atualizado_em?: string;
  itens?: KdsItem[];
};

const STATUS_LIST: PedidoStatus[] = [
  "Todos",
  "Recebido",
  "Em preparo",
  "Pronto",
  "Entregue",
  "Cancelado",
];

const STATUS_COLOR: Record<string, string> = {
  Recebido: "bg-amber-400/20 text-amber-100 border-amber-300/20",
  "Em preparo": "bg-blue-400/20 text-blue-100 border-blue-300/20",
  Pronto: "bg-emerald-400/20 text-emerald-100 border-emerald-300/20",
  Entregue: "bg-zinc-400/20 text-zinc-100 border-zinc-300/20",
  Cancelado: "bg-red-400/20 text-red-100 border-red-300/20",
};

const PROXIMO_STATUS: Partial<Record<string, PedidoStatus>> = {
  Recebido: "Em preparo",
  "Em preparo": "Pronto",
  Pronto: "Entregue",
};

function money(value: number | string | undefined | null) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTimeBR(value?: string) {
  if (!value) return "--/--/---- --:--:--";

  const date = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatTimeBR(value?: string) {
  if (!value) return "--:--";

  const date = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(date.getTime())) return "--:--";

  return date.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function origemBadge(origem?: string) {
  const value = String(origem || "Totem").toLowerCase();

  if (value.includes("ifood")) return "bg-red-500 text-white";
  if (value.includes("consumer")) return "bg-blue-500 text-white";
  if (value.includes("anota")) return "bg-purple-500 text-white";
  if (value.includes("pdv")) return "bg-emerald-400 text-black";

  return "bg-amber-400 text-black";
}

async function imprimirPedido(pedido: Pedido) {
  const res = await fetch("http://localhost:4567/print", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pedido }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.sucesso === false) {
    throw new Error(data?.error || "Erro ao enviar impressão para o agente local.");
  }

  return data;
}

export default function PedidosAdmin({ empresaId }: { empresaId: string }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [status, setStatus] = useState<PedidoStatus>("Todos");
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [ultimoSync, setUltimoSync] = useState<Date | null>(null);
  const [pedidoHistorico, setPedidoHistorico] = useState<Pedido | null>(null);
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);
  const [modalConfirmacao, setModalConfirmacao] = useState<{
    aberto: boolean;
    pedido?: Pedido;
    statusNovo?: PedidoStatus;
    titulo?: string;
    mensagem?: string;
  }>({ aberto: false });

  async function carregarPedidos(silencioso = false) {
    if (!empresaId) return;

    try {
      if (!silencioso) setLoading(true);
      setErro("");

      const res = await fetch(
        `${API}/api/cardapio/cozinha/${empresaId}/pedidos?status=Todos`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao carregar pedidos.");
      }

      setPedidos(Array.isArray(data?.pedidos) ? data.pedidos : []);
      setUltimoSync(new Date());
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar pedidos.");
    } finally {
      setLoading(false);
    }
  }

  async function alterarStatusPedido(pedidoId: number, statusNovo: PedidoStatus) {
    try {
      const res = await fetch(
        `${API}/api/cardapio/cozinha/pedidos/${pedidoId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: statusNovo,
            usuario_id: "admin",
            observacao: "Alterado pelo painel admin",
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao alterar status.");
      }

      setPedidos((current) =>
        current.map((pedido) =>
          Number(pedido.Id) === Number(pedidoId)
            ? {
                ...pedido,
                status: statusNovo,
                atualizado_em: new Date().toISOString(),
              }
            : pedido
        )
      );
    } catch (error: any) {
      setErro(error?.message || "Erro ao alterar status.");
    }
  }

  async function chamarNoPainel(pedidoId: number) {
    try {
      const res = await fetch(`${API}/api/cardapio/painel/chamar/${pedidoId}`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao chamar no painel.");
      }

      await carregarPedidos(true);
    } catch (error: any) {
      setErro(error?.message || "Erro ao chamar no painel.");
    }
  }

  async function reimprimir(pedido: Pedido) {
    try {
      await imprimirPedido(pedido);
    } catch (error: any) {
      setErro(
        "Não foi possível enviar para o agente de impressão local. Verifique se o agente está rodando em http://localhost:4567. " +
          (error?.message || "")
      );
    }
  }

  function pedirConfirmacaoStatus(pedido: Pedido, statusNovo: PedidoStatus) {
    setModalConfirmacao({
      aberto: true,
      pedido,
      statusNovo,
      titulo: `Alterar para ${statusNovo}`,
      mensagem: `Confirma alterar o pedido ${
        pedido.numero_pedido || pedido.Id
      } para "${statusNovo}"?`,
    });
  }

  async function confirmarAcao() {
    if (!modalConfirmacao.pedido || !modalConfirmacao.statusNovo) return;

    await alterarStatusPedido(
      modalConfirmacao.pedido.Id,
      modalConfirmacao.statusNovo
    );

    setModalConfirmacao({ aberto: false });
  }

  useEffect(() => {
    carregarPedidos();

    const interval = window.setInterval(() => {
      carregarPedidos(true);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [empresaId]);

  const pedidosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return pedidos
      .filter((pedido) => {
        if (status !== "Todos" && pedido.status !== status) return false;

        if (!termo) return true;

        const texto = [
          pedido.numero_pedido,
          pedido.cliente_nome,
          pedido.cliente_telefone,
          pedido.mesa,
          pedido.origem,
          pedido.status,
          pedido.forma_pagamento,
          ...(Array.isArray(pedido.itens)
            ? pedido.itens.map((item) => item.nome_produto || item.nome)
            : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return texto.includes(termo);
      })
      .sort((a, b) => Number(b.Id) - Number(a.Id));
  }, [pedidos, busca, status]);

  const resumo = useMemo(() => {
    const totalVendas = pedidos.reduce(
      (sum, pedido) => sum + Number(pedido.total || 0),
      0
    );

    return {
      total: pedidos.length,
      recebidos: pedidos.filter((p) => p.status === "Recebido").length,
      preparo: pedidos.filter((p) => p.status === "Em preparo").length,
      prontos: pedidos.filter((p) => p.status === "Pronto").length,
      entregues: pedidos.filter((p) => p.status === "Entregue").length,
      cancelados: pedidos.filter((p) => p.status === "Cancelado").length,
      totalVendas,
    };
  }, [pedidos]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/95 px-5 py-4 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-emerald-400 p-3 text-black">
              <ShoppingBag className="h-7 w-7" />
            </div>

            <div>
              <h1 className="text-2xl font-black">Painel Admin de Pedidos</h1>
              <p className="text-sm text-white/50">
                Empresa #{empresaId} • {resumo.total} pedidos carregados
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3">
              <Search className="h-4 w-4 text-white/50" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar pedido, cliente, telefone, item..."
                className="w-full min-w-[260px] bg-transparent text-sm outline-none placeholder:text-white/40"
              />
            </div>

            <button
              type="button"
              onClick={() => carregarPedidos()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black transition hover:bg-white/20"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/40">
          <span className="flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            Última atualização:{" "}
            {ultimoSync ? formatTimeBR(ultimoSync.toISOString()) : "--:--"}
          </span>

          {erro && <span className="text-red-300">{erro}</span>}
        </div>
      </header>

      <section className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6">
        <ResumoCard label="Total" value={resumo.total} />
        <ResumoCard label="Recebidos" value={resumo.recebidos} tone="amber" />
        <ResumoCard label="Em preparo" value={resumo.preparo} tone="blue" />
        <ResumoCard label="Prontos" value={resumo.prontos} tone="emerald" />
        <ResumoCard label="Entregues" value={resumo.entregues} />
        <ResumoCard label="Total vendido" value={money(resumo.totalVendas)} />
      </section>

      <section className="px-5 pb-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white/70">
            <Filter className="h-4 w-4" />
            Filtros
          </div>

          {STATUS_LIST.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatus(item)}
              className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                status === item
                  ? "bg-emerald-400 text-black"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
          <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1.3fr] gap-4 border-b border-white/10 px-5 py-4 text-xs font-black uppercase tracking-[0.18em] text-white/40 xl:grid">
            <span>Pedido</span>
            <span>Cliente</span>
            <span>Status</span>
            <span>Pagamento</span>
            <span>Total</span>
            <span>Ações</span>
          </div>

          {loading && pedidosFiltrados.length === 0 ? (
            <div className="p-8 text-center text-white/50">Carregando pedidos...</div>
          ) : pedidosFiltrados.length === 0 ? (
            <div className="p-8 text-center text-white/50">
              Nenhum pedido encontrado.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {pedidosFiltrados.map((pedido) => (
                <PedidoRow
                  key={pedido.Id}
                  pedido={pedido}
                  onDetalhes={() => setPedidoSelecionado(pedido)}
                  onHistorico={() => setPedidoHistorico(pedido)}
                  onImprimir={() => reimprimir(pedido)}
                  onChamarPainel={() => chamarNoPainel(pedido.Id)}
                  onStatus={(statusNovo) => pedirConfirmacaoStatus(pedido, statusNovo)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <PedidoEventosModal
        aberto={!!pedidoHistorico}
        pedidoId={pedidoHistorico?.Id || ""}
        numeroPedido={pedidoHistorico?.numero_pedido}
        clienteNome={pedidoHistorico?.cliente_nome}
        onClose={() => setPedidoHistorico(null)}
      />

      {pedidoSelecionado && (
        <PedidoDetalhesModal
          pedido={pedidoSelecionado}
          onClose={() => setPedidoSelecionado(null)}
          onHistorico={() => setPedidoHistorico(pedidoSelecionado)}
          onImprimir={() => reimprimir(pedidoSelecionado)}
        />
      )}

      {modalConfirmacao.aberto && (
        <ConfirmacaoModal
          titulo={modalConfirmacao.titulo || "Confirmar ação"}
          mensagem={modalConfirmacao.mensagem || "Deseja continuar?"}
          onClose={() => setModalConfirmacao({ aberto: false })}
          onConfirm={confirmarAcao}
        />
      )}
    </main>
  );
}

function ResumoCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "amber" | "blue" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-300"
      : tone === "blue"
      ? "text-blue-300"
      : tone === "emerald"
      ? "text-emerald-300"
      : "text-white";

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm text-white/40">{label}</p>
      <p className={`mt-2 text-2xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function PedidoRow({
  pedido,
  onDetalhes,
  onHistorico,
  onImprimir,
  onChamarPainel,
  onStatus,
}: {
  pedido: Pedido;
  onDetalhes: () => void;
  onHistorico: () => void;
  onImprimir: () => void;
  onChamarPainel: () => void;
  onStatus: (status: PedidoStatus) => void;
}) {
  const nextStatus = PROXIMO_STATUS[String(pedido.status || "")];
  const statusClass =
    STATUS_COLOR[String(pedido.status || "")] ||
    "bg-white/10 text-white border-white/10";

  return (
    <div className="grid gap-4 px-5 py-4 xl:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1.3fr] xl:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-black">{pedido.numero_pedido || pedido.Id}</p>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-black ${origemBadge(
              pedido.origem
            )}`}
          >
            {pedido.origem || "Totem"}
          </span>
        </div>
        <p className="mt-1 text-xs text-white/40">
          {formatDateTimeBR(pedido.criado_em)}
        </p>
      </div>

      <div>
        <p className="font-bold">{pedido.cliente_nome || "Cliente"}</p>
        <p className="text-xs text-white/40">
          {pedido.cliente_telefone || pedido.mesa || "Sem telefone"}
        </p>
      </div>

      <div>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass}`}>
          {pedido.status || "Recebido"}
        </span>
      </div>

      <div>
        <p className="font-bold">{pedido.forma_pagamento || "Não informado"}</p>
        <p className="text-xs text-white/40">
          {pedido.status_pagamento || "Pendente"}
        </p>
      </div>

      <div>
        <p className="text-lg font-black text-emerald-300">
          {money(pedido.total)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onDetalhes}
          className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black transition hover:bg-white/20"
        >
          Detalhes
        </button>

        <button
          type="button"
          onClick={onHistorico}
          className="flex items-center gap-1 rounded-xl bg-blue-400/15 px-3 py-2 text-xs font-black text-blue-100 transition hover:bg-blue-400/25"
        >
          <History className="h-3.5 w-3.5" />
          Histórico
        </button>

        <button
          type="button"
          onClick={onImprimir}
          className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-black transition hover:bg-white/20"
        >
          <Printer className="h-3.5 w-3.5" />
          Imprimir
        </button>

        {nextStatus && (
          <button
            type="button"
            onClick={() => onStatus(nextStatus)}
            className="flex items-center gap-1 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-black text-black transition hover:bg-emerald-300"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {nextStatus}
          </button>
        )}

        {pedido.status === "Pronto" && (
          <button
            type="button"
            onClick={onChamarPainel}
            className="flex items-center gap-1 rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-black transition hover:bg-amber-300"
          >
            <BellRing className="h-3.5 w-3.5" />
            Chamar
          </button>
        )}

        {!["Entregue", "Cancelado"].includes(String(pedido.status || "")) && (
          <button
            type="button"
            onClick={() => onStatus("Cancelado")}
            className="flex items-center gap-1 rounded-xl bg-red-500/15 px-3 py-2 text-xs font-black text-red-200 transition hover:bg-red-500/25"
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

function PedidoDetalhesModal({
  pedido,
  onClose,
  onHistorico,
  onImprimir,
}: {
  pedido: Pedido;
  onClose: () => void;
  onHistorico: () => void;
  onImprimir: () => void;
}) {
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];

  return (
    <div className="fixed inset-0 z-[998] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 text-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <h2 className="text-xl font-black">
              Pedido {pedido.numero_pedido || pedido.Id}
            </h2>
            <p className="mt-1 text-sm text-white/50">
              {pedido.cliente_nome || "Cliente"} • {formatDateTimeBR(pedido.criado_em)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onHistorico}
              className="rounded-2xl bg-blue-400/15 px-4 py-3 text-sm font-black text-blue-100 transition hover:bg-blue-400/25"
            >
              Histórico
            </button>

            <button
              type="button"
              onClick={onImprimir}
              className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black transition hover:bg-white/20"
            >
              Imprimir
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-white/10 p-3 transition hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-4">
            <ResumoCard label="Status" value={pedido.status || "Recebido"} />
            <ResumoCard label="Pagamento" value={pedido.forma_pagamento || "-"} />
            <ResumoCard label="Status pag." value={pedido.status_pagamento || "-"} />
            <ResumoCard label="Total" value={money(pedido.total)} tone="emerald" />
          </div>

          {pedido.observacao && (
            <div className="mt-4 rounded-2xl bg-blue-400/10 p-4 text-blue-100">
              <strong>Observação:</strong> {pedido.observacao}
            </div>
          )}

          <div className="mt-5 space-y-3">
            {itens.length === 0 ? (
              <div className="rounded-2xl bg-white/5 p-5 text-center text-white/40">
                Nenhum item encontrado.
              </div>
            ) : (
              itens.map((item, index) => {
                const adicionais = Array.isArray(item.insumos) ? item.insumos : [];

                return (
                  <div
                    key={`${item.Id || index}`}
                    className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-black">
                          {Number(item.quantidade || 1)}x{" "}
                          {item.nome_produto || item.nome || "Produto"}
                        </p>
                        <p className="mt-1 text-sm text-white/40">
                          Setor: {item.setor_impressao || item.setor || "cozinha"}
                        </p>
                      </div>

                      <p className="font-black text-emerald-300">
                        {money(item.subtotal)}
                      </p>
                    </div>

                    {adicionais.length > 0 && (
                      <div className="mt-3 rounded-2xl bg-black/30 p-3">
                        <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-white/40">
                          Adicionais
                        </p>

                        {adicionais.map((adicional, addIndex) => (
                          <p
                            key={`${adicional.Id || adicional.nome}-${addIndex}`}
                            className="text-sm text-white/70"
                          >
                            + {Number(adicional.quantidade || 1)}x {adicional.nome}
                          </p>
                        ))}
                      </div>
                    )}

                    {item.observacao && (
                      <div className="mt-3 rounded-2xl bg-yellow-400/10 p-3 text-sm text-yellow-100">
                        Obs: {item.observacao}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ConfirmacaoModal({
  titulo,
  mensagem,
  onClose,
  onConfirm,
}: {
  titulo: string;
  mensagem: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-6 text-white shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-2xl bg-amber-400 p-3 text-black">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-black">{titulo}</h2>
        </div>

        <p className="text-white/70">{mensagem}</p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-white/10 px-4 py-3 font-black transition hover:bg-white/20"
          >
            Voltar
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="rounded-2xl bg-emerald-400 px-4 py-3 font-black text-black transition hover:bg-emerald-300"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
