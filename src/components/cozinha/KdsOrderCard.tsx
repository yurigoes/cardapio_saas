"use client";

import { useState } from "react";
import {
  CheckCircle2,
  MonitorSpeaker,
  Printer,
  RotateCcw,
  X
} from "lucide-react";

const LOCAL_PRINT_URL =
  process.env.NEXT_PUBLIC_LOCAL_PRINT_URL ||
  "http://localhost:4567/print";

type Props = {
  pedido: any;
  statusAtual?: any;
  onChangeStatus?: (pedidoId: number, status: any) => Promise<void> | void;
  onCallPanel?: (pedidoId: number) => Promise<void> | void;
  formatTime?: (value?: string) => string;
};

const STATUS_FLOW: Record<string, { label: string; next: string; className: string }> = {
  Recebido: {
    label: "Iniciar preparo",
    next: "Em preparo",
    className: "border border-sky-300/20 bg-gradient-to-br from-sky-400/90 to-cyan-500/90 text-white backdrop-blur-xl hover:from-sky-300 hover:to-cyan-400"
  },
  "Em preparo": {
    label: "Marcar como pronto",
    next: "Pronto",
    className: "border border-emerald-300/20 bg-gradient-to-br from-emerald-400/90 to-green-500/90 text-white backdrop-blur-xl hover:from-emerald-300 hover:to-green-400"
  },
  Pronto: {
    label: "Entregar pedido",
    next: "Entregue",
    className: "border border-violet-300/20 bg-gradient-to-br from-violet-400/90 to-fuchsia-500/90 text-white backdrop-blur-xl hover:from-violet-300 hover:to-fuchsia-400"
  }
};

function getItens(pedido: any) {
  if (Array.isArray(pedido?.itens)) return pedido.itens;
  if (Array.isArray(pedido?.items)) return pedido.items;
  if (Array.isArray(pedido?.pedido_itens)) return pedido.pedido_itens;
  return [];
}

function money(value: any) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function nomeItem(item: any) {
  const nome = item?.nome_exibicao || item?.nome_produto || item?.produto_nome || item?.nome || "Produto";
  const variacao = item?.variacao_nome || item?.variacao?.nome || item?.variacao_selecionada?.nome || "";

  if (item?.nome_exibicao) return item.nome_exibicao;
  return variacao ? `${nome} - ${variacao}` : nome;
}

function normalizarPedidoParaImpressao(pedido: any, options: any = {}) {
  return {
    ...pedido,
    ...options,
    Id: pedido?.Id || pedido?.id || pedido?.pedido_id,
    id: pedido?.id || pedido?.Id || pedido?.pedido_id,
    pedido_id: pedido?.pedido_id || pedido?.Id || pedido?.id,
    empresa_id: pedido?.empresa_id || pedido?.empresaId || pedido?.empresa?.Id || pedido?.empresa?.id,
    numero_pedido: pedido?.numero_pedido || pedido?.numero || pedido?.Id || pedido?.id,
    cliente_nome: pedido?.cliente_nome || pedido?.nome_cliente || pedido?.cliente?.nome || "Cliente",
    itens: getItens(pedido).map((item: any) => ({
      ...item,
      nome_exibicao: nomeItem(item),
      nome: item?.nome_produto || item?.produto_nome || item?.nome || "Produto",
      nome_produto: item?.nome_produto || item?.produto_nome || item?.nome || "Produto",
      variacao_nome: item?.variacao_nome || item?.variacao?.nome || item?.variacao_selecionada?.nome || "",
      preco: Number(item?.variacao_preco ?? item?.preco_unitario ?? item?.preco ?? 0),
      preco_unitario: Number(item?.variacao_preco ?? item?.preco_unitario ?? item?.preco ?? 0),
      setor_impressao: item?.setor_impressao || item?.setor || item?.area_impressao || item?.area || "",
      setor: item?.setor || item?.setor_impressao || item?.area_impressao || item?.area || ""
    }))
  };
}

async function postAgenteLocal(url: string, payload: any) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pedido: payload })
  });

  let data: any = null;
  try { data = await response.json(); } catch { data = null; }

  if (!response.ok || data?.sucesso === false) {
    throw new Error(data?.error || data?.message || `Agente local respondeu HTTP ${response.status}.`);
  }

  return data || { sucesso: true };
}

export async function imprimirPedido(pedido: any, reimpressaoOrOptions: boolean | any = false) {
  const options =
    typeof reimpressaoOrOptions === "object"
      ? reimpressaoOrOptions
      : { reimpressao: !!reimpressaoOrOptions };

  const payload = normalizarPedidoParaImpressao(pedido, {
    ...options,
    origem_solicitacao: "KDS",
    source: "manual"
  });

  if (!payload.Id || !payload.empresa_id) {
    throw new Error("Pedido inválido para impressão. Falta Id ou empresa_id.");
  }

  try {
    return await postAgenteLocal(LOCAL_PRINT_URL, payload);
  } catch (errorLocalhost: any) {
    if (LOCAL_PRINT_URL.includes("localhost")) {
      const fallbackUrl = LOCAL_PRINT_URL.replace("localhost", "127.0.0.1");
      try {
        return await postAgenteLocal(fallbackUrl, payload);
      } catch {}
    }

    throw new Error(
      `Não consegui enviar para o agente local em ${LOCAL_PRINT_URL}. ` +
      `Verifique se o agente YuGo está aberto neste computador. ` +
      `Detalhe: ${errorLocalhost?.message || "falha de conexão"}`
    );
  }
}

export default function KdsOrderCard({
  pedido,
  statusAtual,
  onChangeStatus,
  onCallPanel,
  formatTime
}: Props) {
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [modalReimpressao, setModalReimpressao] = useState(false);
  const [motivoReimpressao, setMotivoReimpressao] = useState("");

  const status = String(statusAtual || pedido?.status || "Recebido");
  const acao = STATUS_FLOW[status];
  const itens = getItens(pedido);

  async function handlePrint(reimpressao = false, motivo = "") {
    try {
      setLoading(true);
      setMensagem("");

      await imprimirPedido(pedido, {
        reimpressao,
        motivo_reimpressao: motivo,
        origem_solicitacao: "KDS"
      });

      setMensagem(
        reimpressao
          ? "Reimpressão enviada ao agente local usando o mesmo layout atual."
          : "Impressão enviada ao agente local usando o mesmo layout atual."
      );
    } catch (error: any) {
      setMensagem(error?.message || "Erro ao solicitar impressão.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmarReimpressao() {
    const motivo = motivoReimpressao.trim();

    if (!motivo) {
      setMensagem("Informe o motivo da reimpressão.");
      return;
    }

    setModalReimpressao(false);
    setMotivoReimpressao("");
    await handlePrint(true, motivo);
  }

  async function handleNextStatus() {
    if (!acao || !onChangeStatus) return;
    await onChangeStatus(Number(pedido?.Id || pedido?.id || pedido?.pedido_id), acao.next);
  }

  return (
    <article className="rounded-[1.75rem] border border-white/10 bg-zinc-950/70 p-5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.38)]">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-black">
            Pedido #{pedido?.numero_pedido || pedido?.numero || pedido?.Id}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{status}</span>
            {(pedido?.criado_em || pedido?.created_at) && formatTime && (
              <>
                <span>•</span>
                <span>{formatTime(pedido?.criado_em || pedido?.created_at)}</span>
              </>
            )}
          </div>
        </div>

        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white">
          KDS
        </span>
      </header>

      <div className="mt-4 space-y-2">
        {itens.length === 0 ? (
          <div className="rounded-2xl bg-white/[0.04] p-4 text-sm text-zinc-500">
            Sem itens carregados.
          </div>
        ) : (
          itens.map((item: any, index: number) => {
            const preco = Number(item?.variacao_preco ?? item?.preco_unitario ?? item?.preco ?? 0);

            return (
              <div
                key={`${item?.Id || item?.id || index}`}
                className="rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <strong className="block break-words text-base leading-snug">
                      {Number(item?.quantidade || 1)}x {nomeItem(item)}
                    </strong>

                    {item?.observacao && (
                      <p className="mt-2 rounded-xl bg-amber-400/10 p-2 text-sm text-amber-100">
                        Obs: {item.observacao}
                      </p>
                    )}
                  </div>

                  <span className="shrink-0 text-sm font-black text-emerald-300">
                    {money(preco)}
                  </span>
                </div>

                {Array.isArray(item?.insumos) && item.insumos.length > 0 && (
                  <div className="mt-3 space-y-1 text-sm text-zinc-400">
                    {item.insumos.map((insumo: any, i: number) => (
                      <p key={i}>
                        + {Number(insumo.quantidade || 1)}x {insumo.nome}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {mensagem && (
        <div className="mt-4 rounded-2xl bg-white/[0.05] p-3 text-sm text-zinc-300">
          {mensagem}
        </div>
      )}

      <footer className="mt-5 grid gap-3">
        {acao && (
          <button
            type="button"
            onClick={handleNextStatus}
            className={`group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/15 px-4 py-3 text-sm font-black shadow-[0_14px_35px_rgba(0,0,0,0.30)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(0,0,0,0.38)] ${acao.className}`}
          >
            <span className="absolute inset-0 bg-white/15 opacity-0 transition group-hover:opacity-100" />
            <CheckCircle2 className="relative h-4 w-4" />
            <span className="relative">{acao.label}</span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handlePrint(false)}
            disabled={loading}
            className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-white via-zinc-100 to-zinc-200 px-4 py-3 text-sm font-black text-black shadow-[0_18px_40px_rgba(255,255,255,0.12)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] disabled:opacity-60"
          >
            <span className="absolute inset-0 bg-gradient-to-br from-white/60 to-transparent opacity-70" />
            <Printer className="relative h-4 w-4" />
            <span className="relative">Imprimir</span>
          </button>

          <button
            type="button"
            onClick={() => setModalReimpressao(true)}
            disabled={loading}
            className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl border border-amber-200/30 bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-400 px-4 py-3 text-sm font-black text-black shadow-[0_18px_40px_rgba(251,191,36,0.28)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] disabled:opacity-60"
          >
            <span className="absolute inset-0 bg-gradient-to-br from-white/45 to-transparent opacity-70" />
            <RotateCcw className="relative h-4 w-4" />
            <span className="relative">Reimprimir</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {onCallPanel && (
            <button
              type="button"
              onClick={() => onCallPanel(Number(pedido?.Id || pedido?.id || pedido?.pedido_id))}
              className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl border border-cyan-200/20 bg-cyan-500/20 px-4 py-3 text-sm font-black text-cyan-100 shadow-[0_14px_35px_rgba(6,182,212,0.16)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:bg-cyan-500/30"
            >
              <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent opacity-70" />
              <MonitorSpeaker className="relative h-4 w-4" />
              <span className="relative">Chamar painel</span>
            </button>
          )}

          {status !== "Cancelado" && status !== "Entregue" && onChangeStatus && (
            <button
              type="button"
              onClick={() =>
                onChangeStatus(
                  Number(pedido?.Id || pedido?.id || pedido?.pedido_id),
                  "Cancelado"
                )
              }
              className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl border border-red-300/20 bg-red-500/20 px-4 py-3 text-sm font-black text-red-100 shadow-[0_14px_35px_rgba(239,68,68,0.16)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:bg-red-500/30"
            >
              <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent opacity-70" />
              <span className="relative">Cancelar</span>
            </button>
          )}
        </div>
      </footer>

      {modalReimpressao && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black">Motivo da reimpressão</h3>
                <p className="mt-1 text-sm text-white/50">
                  Informe o motivo para registrar no controle empresarial.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalReimpressao(false)}
                className="rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={motivoReimpressao}
              onChange={(event) => setMotivoReimpressao(event.target.value)}
              placeholder="Ex: Impressão falhou, papel acabou, pedido extraviado..."
              className="mt-5 min-h-28 w-full rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/60"
            />

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setModalReimpressao(false)}
                className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/20"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarReimpressao}
                disabled={loading}
                className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-black hover:bg-amber-300 disabled:opacity-60"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
