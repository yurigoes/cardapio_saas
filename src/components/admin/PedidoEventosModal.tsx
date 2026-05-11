"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, FileText, RefreshCw, X } from "lucide-react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type PedidoEvento = {
  Id?: number;
  pedido_id?: number | string;
  numero_pedido?: string;
  status_anterior?: string;
  status_novo?: string;
  origem?: string;
  acao?: string;
  usuario_id?: string;
  usuario_nome?: string;
  setor?: string;
  impressora?: string;
  observacao?: string;
  payload_json?: string;
  criado_em?: string;
};

type Props = {
  aberto: boolean;
  pedidoId: number | string;
  numeroPedido?: string;
  clienteNome?: string;
  onClose: () => void;
};

function formatarData(value?: string) {
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

function parsePayload(value?: string) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export default function PedidoEventosModal({
  aberto,
  pedidoId,
  numeroPedido,
  clienteNome,
  onClose,
}: Props) {
  const [eventos, setEventos] = useState<PedidoEvento[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function carregarEventos() {
    if (!pedidoId) return;

    try {
      setLoading(true);
      setErro("");

      const res = await fetch(`${API}/api/cardapio/pedidos/${pedidoId}/eventos`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao carregar histórico do pedido.");
      }

      setEventos(Array.isArray(data?.eventos) ? data.eventos : []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar histórico do pedido.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (aberto) carregarEventos();
  }, [aberto, pedidoId]);

  const eventosOrdenados = useMemo(() => {
    return [...eventos].sort((a, b) => Number(b.Id || 0) - Number(a.Id || 0));
  }, [eventos]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 text-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-400 p-3 text-black">
                <FileText className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-xl font-black">Histórico do Pedido</h2>
                <p className="text-sm text-white/50">
                  {clienteNome || "Cliente"} • Pedido {numeroPedido || pedidoId}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={carregarEventos}
              className="rounded-2xl bg-white/10 p-3 transition hover:bg-white/20"
              title="Atualizar"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-white/10 p-3 transition hover:bg-white/20"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5">
          {erro && (
            <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
              {erro}
            </div>
          )}

          {loading && eventosOrdenados.length === 0 ? (
            <div className="rounded-2xl bg-white/5 p-6 text-center text-white/50">
              Carregando histórico...
            </div>
          ) : eventosOrdenados.length === 0 ? (
            <div className="rounded-2xl bg-white/5 p-6 text-center text-white/50">
              Nenhum evento registrado para este pedido.
            </div>
          ) : (
            <div className="space-y-4">
              {eventosOrdenados.map((evento) => {
                const payload = parsePayload(evento.payload_json);

                return (
                  <article
                    key={evento.Id || `${evento.acao}-${evento.criado_em}`}
                    className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-base font-black">
                          {evento.acao || "Evento do pedido"}
                        </h3>

                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {evento.origem && (
                            <span className="rounded-full bg-blue-400/20 px-3 py-1 font-bold text-blue-100">
                              {evento.origem}
                            </span>
                          )}

                          {evento.status_anterior || evento.status_novo ? (
                            <span className="rounded-full bg-emerald-400/20 px-3 py-1 font-bold text-emerald-100">
                              {evento.status_anterior || "Inicial"} →{" "}
                              {evento.status_novo || "Sem alteração"}
                            </span>
                          ) : null}

                          {evento.setor && (
                            <span className="rounded-full bg-amber-400/20 px-3 py-1 font-bold text-amber-100">
                              Setor: {evento.setor}
                            </span>
                          )}

                          {evento.impressora && (
                            <span className="rounded-full bg-purple-400/20 px-3 py-1 font-bold text-purple-100">
                              {evento.impressora}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-white/50">
                        <Clock className="h-4 w-4" />
                        {formatarData(evento.criado_em)}
                      </div>
                    </div>

                    {(evento.usuario_nome || evento.usuario_id) && (
                      <p className="mt-3 text-sm text-white/60">
                        Usuário: {evento.usuario_nome || evento.usuario_id}
                      </p>
                    )}

                    {evento.observacao && (
                      <p className="mt-3 rounded-2xl bg-black/30 p-3 text-sm text-white/70">
                        {evento.observacao}
                      </p>
                    )}

                    {payload && (
                      <details className="mt-3 rounded-2xl bg-black/30 p-3 text-sm text-white/60">
                        <summary className="cursor-pointer font-bold text-white/80">
                          Ver payload técnico
                        </summary>
                        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
                          {typeof payload === "string"
                            ? payload
                            : JSON.stringify(payload, null, 2)}
                        </pre>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
