"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, Clock, RefreshCw, Search, Wifi, WifiOff } from "lucide-react";
import KdsOrderCard, { imprimirPedido } from "@/components/cozinha/KdsOrderCard";
import { alertar } from "@/components/ui/ConfirmModal";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type PedidoStatus =
  | "Recebido"
  | "Em preparo"
  | "Pronto"
  | "Entregue"
  | "Cancelado";

type EmpresaConfig = {
  Id?: number;
  nome_fantasia?: string;
  logo_url?: string;
  cor_primaria?: string;
};

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
  criado_em?: string;
};

type KdsPedido = {
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

const STATUS_COLUNAS: PedidoStatus[] = [
  "Recebido",
  "Em preparo",
  "Pronto",
  "Entregue",
];

const STATUS_LABEL: Record<PedidoStatus, string> = {
  Recebido: "Recebidos",
  "Em preparo": "Em preparo",
  Pronto: "Prontos",
  Entregue: "Entregues",
  Cancelado: "Cancelados",
};

function formatTime(value?: string) {
  if (!value) return "--:--";

  const date = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(date.getTime())) return "--:--";

  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeStatus(status?: string): PedidoStatus {
  if (status === "Em preparo") return "Em preparo";
  if (status === "Pronto") return "Pronto";
  if (status === "Entregue") return "Entregue";
  if (status === "Cancelado") return "Cancelado";
  return "Recebido";
}

function corSegura(cor?: string) {
  const value = String(cor || "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#fbbf24";
}

export default function KdsBoard({ empresaId }: { empresaId: string }) {
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null);
  const [pedidos, setPedidos] = useState<KdsPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [ultimoSync, setUltimoSync] = useState<Date | null>(null);
  const [somNovos, setSomNovos] = useState(true);
  const [impressaoAuto, setImpressaoAuto] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pedidosAnterioresRef = useRef<number[]>([]);
  const primeiraCargaRef = useRef(true);
  const somNovosRef = useRef(true);
  const impressaoAutoRef = useRef(false);
  const pedidosImpressosRef = useRef<number[]>([]);

  const primaryColor = corSegura(empresa?.cor_primaria);

  useEffect(() => {
    audioRef.current = new Audio("/sons/novo-pedido.mp3");
    audioRef.current.preload = "auto";
  }, []);

  useEffect(() => {
    somNovosRef.current = somNovos;
  }, [somNovos]);

  useEffect(() => {
    impressaoAutoRef.current = impressaoAuto;
  }, [impressaoAuto]);

  const carregarEmpresa = useCallback(async () => {
    if (!empresaId) return;

    try {
      const res = await fetch(`${API}/api/cardapio/admin/empresas/${empresaId}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (res.ok && data?.empresa) {
        setEmpresa(data.empresa);
      }
    } catch {
      // Não trava o KDS se a configuração visual falhar.
    }
  }, [empresaId]);

  const carregarPedidos = useCallback(
    async (silencioso = false) => {
      if (!empresaId) return;

      if (!silencioso) setLoading(true);

      try {
        setErro("");

        const res = await fetch(
          `${API}/api/cardapio/cozinha/${empresaId}/pedidos?status=Todos`,
          {
            cache: "no-store",
          }
        );

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Erro ao carregar pedidos.");
        }

        const lista = Array.isArray(data?.pedidos) ? data.pedidos : [];
        const idsAtuais = lista.map((pedido: KdsPedido) => Number(pedido.Id));

        const idsAnteriores = pedidosAnterioresRef.current;
        const novosPedidos = idsAtuais.filter(
          (id: number) => !idsAnteriores.includes(id)
        );

        const audio = audioRef.current;
        const deveTocarSom =
          !primeiraCargaRef.current &&
          novosPedidos.length > 0 &&
          somNovosRef.current &&
          audio !== null;

        if (deveTocarSom && audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }

        const deveImprimirAutomatico =
          !primeiraCargaRef.current &&
          novosPedidos.length > 0 &&
          impressaoAutoRef.current;

        if (deveImprimirAutomatico) {
          const pedidosRecebidosNovos = lista.filter((pedido: KdsPedido) => {
            const id = Number(pedido.Id);
            return (
              novosPedidos.includes(id) &&
              normalizeStatus(String(pedido.status)) === "Recebido" &&
              !pedidosImpressosRef.current.includes(id)
            );
          });

          for (const pedido of pedidosRecebidosNovos) {
            try {
              await imprimirPedido(pedido);
              pedidosImpressosRef.current = [
                ...pedidosImpressosRef.current,
                Number(pedido.Id),
              ];
            } catch {
              // Mantém o pedido sem marcar como impresso para tentar novamente depois.
            }
          }
        }

        pedidosAnterioresRef.current = idsAtuais;
        primeiraCargaRef.current = false;

        setPedidos(lista);
        setOnline(true);
        setUltimoSync(new Date());
      } catch (error: any) {
        setOnline(false);
        setErro(error?.message || "Erro ao carregar pedidos.");
      } finally {
        setLoading(false);
      }
    },
    [empresaId]
  );

  async function alterarStatusPedido(pedidoId: number, status: PedidoStatus) {
    try {
      const res = await fetch(
        `${API}/api/cardapio/cozinha/pedidos/${pedidoId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
            usuario_id: "",
            observacao: "Alterado pelo KDS",
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
                status,
                atualizado_em: new Date().toISOString(),
              }
            : pedido
        )
      );
    } catch (error: any) {
      await alertar({ titulo: "Erro ao alterar status", mensagem: error?.message ?? "", tipo: "perigo" });
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
      await alertar({ titulo: "Erro ao chamar no painel", mensagem: error?.message ?? "", tipo: "perigo" });
    }
  }

  useEffect(() => {
    pedidosAnterioresRef.current = [];
    pedidosImpressosRef.current = [];
    primeiraCargaRef.current = true;

    carregarEmpresa();
    carregarPedidos();

    const interval = window.setInterval(() => {
      carregarPedidos(true);
    }, 7000);

    return () => window.clearInterval(interval);
  }, [empresaId, carregarEmpresa, carregarPedidos]);

  const pedidosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return pedidos;

    return pedidos.filter((pedido) => {
      const texto = [
        pedido.numero_pedido,
        pedido.cliente_nome,
        pedido.mesa,
        pedido.origem,
        pedido.status,
        ...(Array.isArray(pedido.itens)
          ? pedido.itens.map((item) => item.nome_produto || item.nome)
          : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return texto.includes(termo);
    });
  }, [pedidos, busca]);

  const pedidosPorStatus = useMemo(() => {
    return STATUS_COLUNAS.reduce<Record<PedidoStatus, KdsPedido[]>>(
      (acc, status) => {
        acc[status] = pedidosFiltrados
          .filter((pedido) => normalizeStatus(String(pedido.status)) === status)
          .sort((a, b) => Number(a.Id) - Number(b.Id));

        return acc;
      },
      {
        Recebido: [],
        "Em preparo": [],
        Pronto: [],
        Entregue: [],
        Cancelado: [],
      }
    );
  }, [pedidosFiltrados]);

  const totalAtivos =
    pedidosPorStatus.Recebido.length +
    pedidosPorStatus["Em preparo"].length +
    pedidosPorStatus.Pronto.length;

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/90 px-5 py-4 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex min-h-14 items-center">
              {empresa?.logo_url ? (
                <img
                  src={empresa.logo_url}
                  alt={empresa.nome_fantasia || "Logo"}
                  className="h-12 w-auto max-w-[180px] object-contain drop-shadow-2xl"
                />
              ) : (
                <ChefHat className="h-8 w-8 text-white/70" />
              )}
            </div>

            <div>
              <h1 className="text-2xl font-black">
                {empresa?.nome_fantasia || "KDS Cozinha"}
              </h1>
              <p className="text-sm text-white/50">
                KDS Cozinha • Empresa #{empresaId} • {totalAtivos} pedidos ativos
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3">
              <Search className="h-4 w-4 text-white/50" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar pedido, cliente, mesa ou item..."
                className="w-full min-w-[240px] bg-transparent text-sm outline-none placeholder:text-white/40"
              />
            </div>

            <button
              type="button"
              onClick={() => setSomNovos((current) => !current)}
              className="rounded-2xl px-4 py-3 text-sm font-black"
              style={
                somNovos
                  ? { backgroundColor: primaryColor, color: "#000" }
                  : undefined
              }
            >
              Som {somNovos ? "ON" : "OFF"}
            </button>

            <button
              type="button"
              onClick={() => setImpressaoAuto((current) => !current)}
              className="rounded-2xl px-4 py-3 text-sm font-black"
              style={
                impressaoAuto
                  ? { backgroundColor: primaryColor, color: "#000" }
                  : undefined
              }
            >
              Impressão {impressaoAuto ? "ON" : "OFF"}
            </button>

            <button
              type="button"
              onClick={() => carregarPedidos()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black transition hover:bg-white/20"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>

            <div
              className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black ${
                online ? "text-black" : "bg-red-500 text-white"
              }`}
              style={online ? { backgroundColor: primaryColor } : undefined}
            >
              {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {online ? "Online" : "Offline"}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/40">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Última atualização:{" "}
            {ultimoSync
              ? ultimoSync.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "--:--"}
          </span>

          {erro && <span className="text-red-300">{erro}</span>}
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-120px)] grid-cols-1 gap-4 p-4 xl:grid-cols-4">
        {STATUS_COLUNAS.map((status) => {
          const lista = pedidosPorStatus[status];

          return (
            <div
              key={status}
              className="flex min-h-[420px] flex-col rounded-[2rem] border border-white/10 bg-white/[0.04] p-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black">{STATUS_LABEL[status]}</h2>
                  <p className="text-sm text-white/40">
                    {lista.length} {lista.length === 1 ? "pedido" : "pedidos"}
                  </p>
                </div>

                <span
                  className="rounded-full px-3 py-1 text-sm font-black text-black"
                  style={{ backgroundColor: primaryColor }}
                >
                  {lista.length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
                {loading && lista.length === 0 ? (
                  <div className="rounded-2xl bg-white/5 p-5 text-center text-sm text-white/40">
                    Carregando...
                  </div>
                ) : lista.length === 0 ? (
                  <div className="rounded-2xl bg-white/5 p-5 text-center text-sm text-white/40">
                    Nenhum pedido.
                  </div>
                ) : (
                  lista.map((pedido) => (
                    <KdsOrderCard
                      key={pedido.Id}
                      pedido={pedido}
                      statusAtual={status}
                      onChangeStatus={alterarStatusPedido}
                      onCallPanel={chamarNoPainel}
                      formatTime={formatTime}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
