"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MonitorUp, RefreshCw } from "lucide-react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type EmpresaConfig = {
  Id?: number;
  nome_fantasia?: string;
  logo_url?: string;
  cor_primaria?: string;
};

type PedidoPainel = {
  Id: number;
  numero_pedido?: string;
  cliente_nome?: string;
  mesa?: string;
  origem?: string;
  status?: string;
  chamado_em?: string;
  chamado_count?: number | string;
};

function parsePainelTimestamp(value?: string) {
  if (!value) return 0;

  const text = String(value).trim();

  // NocoDB/backend usually sends "YYYY-MM-DD HH:mm:ss" in America/Sao_Paulo.
  // We parse it manually so the TV device timezone does not shift the displayed hour.
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
  );

  if (match) {
    const [, year, month, day, hour, minute, second = "00"] = match;
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatTime(value?: string) {
  if (!value) return "--:--";

  const text = String(value).trim();

  // If the backend sends local Sao Paulo time as "YYYY-MM-DD HH:mm:ss",
  // show the HH:mm exactly as sent instead of letting the browser timezone change it.
  const localMatch = text.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/);
  if (localMatch) {
    return `${localMatch[1]}:${localMatch[2]}`;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return "--:--";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function corSegura(cor?: string) {
  const value = String(cor || "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#fbbf24";
}

function pedidoKey(pedido?: PedidoPainel | null) {
  if (!pedido) return "";
  return `${pedido.Id}-${pedido.chamado_em || ""}-${pedido.chamado_count || ""}`;
}

export default function PainelTv({ empresaId }: { empresaId: string }) {
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null);
  const [pedidos, setPedidos] = useState<PedidoPainel[]>([]);
  const [destaqueAtual, setDestaqueAtual] = useState<PedidoPainel | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [horaAtual, setHoraAtual] = useState(() =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date())
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chamadosAnterioresRef = useRef<string[]>([]);
  const primeiraCargaRef = useRef(true);

  const primaryColor = corSegura(empresa?.cor_primaria);

  useEffect(() => {
    audioRef.current = new Audio("/sons/painel-chamada.mp3");
    audioRef.current.preload = "auto";
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHoraAtual(
        new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date())
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

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
      // Não trava o painel se a configuração visual falhar.
    }
  }, [empresaId]);

  const carregar = useCallback(async () => {
    try {
      setErro("");

      const res = await fetch(
        `${API}/api/cardapio/painel/${empresaId}/chamados`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao carregar painel.");
      }

      const lista = Array.isArray(data?.pedidos) ? data.pedidos : [];

      const ordenados = [...lista].sort((a: PedidoPainel, b: PedidoPainel) => {
        const dataA = parsePainelTimestamp(a.chamado_em);
        const dataB = parsePainelTimestamp(b.chamado_em);

        return dataB - dataA;
      });

      const chamadosAtuais = ordenados.map((pedido: PedidoPainel) =>
        pedidoKey(pedido)
      );

      const novosChamados = chamadosAtuais.filter(
        (key: string) => !chamadosAnterioresRef.current.includes(key)
      );

      const audio = audioRef.current;
      const deveTocar =
        !primeiraCargaRef.current &&
        novosChamados.length > 0 &&
        audio !== null;

      if (deveTocar && audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }

      chamadosAnterioresRef.current = chamadosAtuais;
      primeiraCargaRef.current = false;

      setPedidos(ordenados);

      if (novosChamados.length > 0) {
        const novoDestaque = ordenados.find(
          (pedido: PedidoPainel) => pedidoKey(pedido) === novosChamados[0]
        );

        if (novoDestaque) {
          setDestaqueAtual(novoDestaque);
        }
      }
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar painel.");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    chamadosAnterioresRef.current = [];
    primeiraCargaRef.current = true;

    carregarEmpresa();
    carregar();

    const interval = window.setInterval(carregar, 5000);

    return () => window.clearInterval(interval);
  }, [empresaId, carregarEmpresa, carregar]);

  useEffect(() => {
    if (!destaqueAtual) return;

    const timer = window.setTimeout(() => {
      setDestaqueAtual(null);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [destaqueAtual]);

  const destaque = destaqueAtual || pedidos[0];
  const lista = useMemo(() => {
    const destaqueAtualKey = pedidoKey(destaque);
    return pedidos
      .filter((pedido) => pedidoKey(pedido) !== destaqueAtualKey)
      .slice(0, 12);
  }, [pedidos, destaque]);

  return (
    <main
      className="min-h-screen text-white"
      style={{
        background: `radial-gradient(circle at top left, ${primaryColor}33, transparent 35%), #000`,
      }}
    >
      <header className="flex items-center justify-between border-b border-white/10 bg-zinc-950/90 px-10 py-7 backdrop-blur">
        <div className="flex items-center gap-5">
          <div className="flex min-h-20 items-center">
            {empresa?.logo_url ? (
              <img
                src={empresa.logo_url}
                alt={empresa.nome_fantasia || "Logo"}
                className="h-16 w-auto max-w-[260px] object-contain drop-shadow-2xl"
              />
            ) : (
              <MonitorUp className="h-12 w-12 text-white/70" />
            )}
          </div>

          <div>
            <h1 className="text-4xl font-black">
              {empresa?.nome_fantasia || "Painel de Pedidos"}
            </h1>
            <p className="text-white/50">Acompanhe sua chamada no painel</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-white/10 px-5 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.24em] text-white/40">
              Horário
            </p>
            <p className="text-3xl font-black">{horaAtual}</p>
          </div>

          <button
            type="button"
            onClick={carregar}
            className="rounded-2xl bg-white/10 p-4"
          >
            <RefreshCw className={`h-6 w-6 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {erro && (
        <div className="mx-10 mt-6 rounded-2xl bg-red-500/20 p-4 text-red-100">
          {erro}
        </div>
      )}

      <section className="grid min-h-[calc(100vh-120px)] grid-cols-1 gap-8 p-10 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="flex items-center justify-center rounded-[3rem] border border-white/10 bg-white/[0.04] p-10">
          {destaque ? (
            <div key={pedidoKey(destaque)} className="animate-fadeInScale text-center">
              <p className="text-3xl font-black" style={{ color: primaryColor }}>
                Pedido chamado
              </p>

              {destaque.cliente_nome ? (
                <>
                  <h2 className="mt-6 text-6xl font-black leading-tight">
                    {destaque.cliente_nome}
                  </h2>

                  <p className="mt-4 text-3xl text-white/60">
                    Pedido {destaque.numero_pedido || destaque.Id}
                  </p>
                </>
              ) : (
                <h2 className="mt-6 text-[9rem] font-black leading-none">
                  {destaque.numero_pedido || destaque.Id}
                </h2>
              )}

              <p className="mt-3 text-2xl text-white/50">
                {destaque.mesa || "Retirada"} • {formatTime(destaque.chamado_em)}
              </p>
            </div>
          ) : (
            <div className="text-center text-white/40">
              <p className="text-4xl font-black">Nenhum pedido chamado</p>
              <p className="mt-3 text-xl">Aguarde sua chamada.</p>
            </div>
          )}
        </div>

        <div className="rounded-[3rem] border border-white/10 bg-white/[0.04] p-8">
          <h3 className="mb-6 text-3xl font-black">Últimos chamados</h3>

          <div className="space-y-4">
            {lista.length === 0 ? (
              <div className="rounded-3xl bg-white/5 p-6 text-center text-white/40">
                Sem outros chamados.
              </div>
            ) : (
              lista.map((pedido) => (
                <div
                  key={pedidoKey(pedido)}
                  className="flex items-center justify-between rounded-3xl bg-white/10 p-5"
                >
                  <div>
                    {pedido.cliente_nome ? (
                      <>
                        <p className="text-2xl font-black">
                          {pedido.cliente_nome}
                        </p>
                        <p className="text-white/50">
                          Pedido {pedido.numero_pedido || pedido.Id}
                        </p>
                      </>
                    ) : (
                      <p className="text-3xl font-black">
                        {pedido.numero_pedido || pedido.Id}
                      </p>
                    )}
                  </div>

                  <p className="text-xl font-black" style={{ color: primaryColor }}>
                    {formatTime(pedido.chamado_em)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <style jsx>{`
        @keyframes fadeInScale {
          0% {
            opacity: 0;
            transform: scale(0.9);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-fadeInScale {
          animation: fadeInScale 0.5s ease;
        }
      `}</style>
    </main>
  );
}