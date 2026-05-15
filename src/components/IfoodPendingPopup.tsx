"use client";

/**
 * Popup global de pedidos iFood pendentes (auto-aceite OFF).
 *
 * - Faz polling em GET /api/painel/ifood/pedidos/pendentes a cada 8s
 * - Quando há pedidos novos, toca beep + aparece card no canto inferior direito
 * - Botões Aceitar (POST .../aceitar) e Recusar (POST .../recusar)
 * - Recusa abre modal estilizado pra escolher motivo (códigos compatíveis iFood)
 * - Não renderiza nada se a empresa não tem iFood configurado / lista vazia
 *
 * Montar em src/app/(empresa)/painel/layout.tsx para ficar global.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Bell, Loader2, X } from "lucide-react";

interface PedidoPendente {
  id: string;
  numero: number;
  cliente_nome: string | null;
  total: string | number;
  created_at: string;
  ifood_order_id: string | null;
}

const POLL_MS = 8000;

/** Códigos iFood Merchant API /requestCancellation */
const MOTIVOS_RECUSA: Array<{ code: string; label: string }> = [
  { code: "501", label: "Item indisponível" },
  { code: "801", label: "Problema no restaurante" },
  { code: "902", label: "Endereço inválido" },
  { code: "908", label: "Fora da área de entrega" },
  { code: "909", label: "Pedido em duplicidade" },
  { code: "999", label: "Outro motivo (descrever)" },
];

function playBeep() {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine"; osc.frequency.value = 880; gain.gain.value = 0.3;
    osc.start(); osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
    setTimeout(() => {
      try {
        const c2 = new Ctx();
        const o2 = c2.createOscillator(); const g2 = c2.createGain();
        o2.connect(g2); g2.connect(c2.destination);
        o2.type = "sine"; o2.frequency.value = 1100; g2.gain.value = 0.3;
        o2.start(); o2.stop(c2.currentTime + 0.3);
        o2.onended = () => c2.close();
      } catch {/* */}
    }, 240);
  } catch {/* */}
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function IfoodPendingPopup() {
  const [pedidos, setPedidos] = useState<PedidoPendente[]>([]);
  const [acao, setAcao] = useState<{ id: string; tipo: "aceitar" | "recusar" } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Modal de recusa
  const [modalRecusa, setModalRecusa] = useState<PedidoPendente | null>(null);
  const [motivoCode, setMotivoCode] = useState<string>("501");
  const [motivoTexto, setMotivoTexto] = useState<string>("");

  const seenRef = useRef<Set<string>>(new Set());
  const firstRunRef = useRef(true);

  const fetchPendentes = useCallback(async () => {
    try {
      const r = await fetch("/api/painel/ifood/pedidos/pendentes", {
        headers: authHeaders(),
        cache:   "no-store",
      });
      if (!r.ok) return;
      const data = await r.json();
      const lista: PedidoPendente[] = data?.data?.pedidos ?? [];
      setPedidos(lista);

      // Beep só quando aparecer pedido novo (não na primeira passagem)
      if (firstRunRef.current) {
        lista.forEach((p) => seenRef.current.add(p.id));
        firstRunRef.current = false;
      } else {
        const novos = lista.filter((p) => !seenRef.current.has(p.id));
        if (novos.length > 0) {
          novos.forEach((p) => seenRef.current.add(p.id));
          playBeep();
        }
      }
    } catch {
      // silencioso - sem iFood / sem rede
    }
  }, []);

  useEffect(() => {
    fetchPendentes();
    const t = setInterval(fetchPendentes, POLL_MS);
    return () => clearInterval(t);
  }, [fetchPendentes]);

  async function aceitar(id: string) {
    setAcao({ id, tipo: "aceitar" }); setErro(null);
    try {
      const r = await fetch(`/api/painel/ifood/pedidos/${id}/aceitar`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data?.error || "Falha ao aceitar");
      setPedidos((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setAcao(null);
    }
  }

  function abrirModalRecusa(pedido: PedidoPendente) {
    setMotivoCode("501");
    setMotivoTexto("");
    setErro(null);
    setModalRecusa(pedido);
  }

  function fecharModalRecusa() {
    setModalRecusa(null);
    setMotivoTexto("");
    setMotivoCode("501");
  }

  async function confirmarRecusa() {
    if (!modalRecusa) return;
    const motivoSelecionado = MOTIVOS_RECUSA.find((m) => m.code === motivoCode);
    const reason = motivoCode === "999"
      ? motivoTexto.trim() || "Outro motivo"
      : motivoSelecionado?.label ?? "Recusado pelo estabelecimento";

    if (motivoCode === "999" && motivoTexto.trim().length < 3) {
      setErro("Descreva o motivo (mín. 3 caracteres)");
      return;
    }

    const id = modalRecusa.id;
    setAcao({ id, tipo: "recusar" });
    setErro(null);
    try {
      const r = await fetch(`/api/painel/ifood/pedidos/${id}/recusar`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ reason, cancellationCode: motivoCode }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data?.error || "Falha ao recusar");
      setPedidos((prev) => prev.filter((p) => p.id !== id));
      fecharModalRecusa();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setAcao(null);
    }
  }

  if (pedidos.length === 0 && !modalRecusa) return null;

  return (
    <>
      {/* Stack de cards de pedidos pendentes */}
      {pedidos.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
          {erro && !modalRecusa && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-300">
              {erro}
            </div>
          )}
          {pedidos.map((p) => {
            const total = typeof p.total === "string" ? parseFloat(p.total) : p.total;
            const totalFmt = isFinite(total)
              ? total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : "-";
            const busy = acao?.id === p.id;
            return (
              <div
                key={p.id}
                className="rounded-xl border border-orange-500/40 bg-slate-900 p-4 shadow-lg shadow-orange-900/30 animate-in slide-in-from-right"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-orange-400 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-orange-400">
                    iFood — Novo pedido #{p.numero}
                  </span>
                </div>
                <p className="text-sm font-medium text-white">{p.cliente_nome ?? "Cliente iFood"}</p>
                <p className="mb-3 text-xs text-slate-400">{totalFmt}</p>

                <div className="flex gap-2">
                  <button
                    onClick={() => aceitar(p.id)}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {busy && acao?.tipo === "aceitar"
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Aceitar
                  </button>
                  <button
                    onClick={() => abrirModalRecusa(p)}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {busy && acao?.tipo === "recusar"
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <XCircle className="h-3.5 w-3.5" />}
                    Recusar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de motivo da recusa */}
      {modalRecusa && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) fecharModalRecusa(); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl shadow-red-900/40 animate-in zoom-in-95">
            {/* Header */}
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold text-white">
                  <XCircle className="h-5 w-5 text-red-400" />
                  Recusar pedido iFood
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  #{modalRecusa.numero} · {modalRecusa.cliente_nome ?? "Cliente iFood"}
                </p>
              </div>
              <button
                onClick={fecharModalRecusa}
                disabled={acao?.tipo === "recusar"}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Lista de motivos */}
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              Motivo da recusa
            </p>
            <div className="mb-4 space-y-1.5 max-h-[260px] overflow-auto pr-1">
              {MOTIVOS_RECUSA.map((m) => (
                <label
                  key={m.code}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                    motivoCode === m.code
                      ? "border-red-500/50 bg-red-500/10"
                      : "border-white/10 hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="motivo"
                    value={m.code}
                    checked={motivoCode === m.code}
                    onChange={() => setMotivoCode(m.code)}
                    className="h-4 w-4 accent-red-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{m.label}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      Código {m.code}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {/* Campo livre quando "outro" */}
            {motivoCode === "999" && (
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Descreva o motivo
                </label>
                <textarea
                  value={motivoTexto}
                  onChange={(e) => setMotivoTexto(e.target.value)}
                  rows={3}
                  maxLength={200}
                  autoFocus
                  placeholder="Ex: Estabelecimento sem entregadores no momento"
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  {motivoTexto.length}/200 caracteres
                </p>
              </div>
            )}

            {/* Erro inline */}
            {erro && (
              <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-300">
                {erro}
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-2">
              <button
                onClick={fecharModalRecusa}
                disabled={acao?.tipo === "recusar"}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarRecusa}
                disabled={acao?.tipo === "recusar"}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                {acao?.tipo === "recusar"
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Recusando...</>
                  : <><XCircle className="h-4 w-4" /> Confirmar recusa</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
