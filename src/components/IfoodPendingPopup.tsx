"use client";

/**
 * Popup global de pedidos iFood pendentes (auto-aceite OFF).
 *
 * - Faz polling em GET /api/painel/ifood/pedidos/pendentes a cada 8s
 * - Quando há pedidos novos, toca beep + aparece card no canto inferior direito
 * - Botões Aceitar (POST .../aceitar) e Recusar (POST .../recusar)
 * - Não renderiza nada se a empresa não tem iFood configurado / lista vazia
 *
 * Montar em src/app/(empresa)/painel/layout.tsx para ficar global.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Bell, Loader2 } from "lucide-react";

interface PedidoPendente {
  id: string;
  numero: number;
  cliente_nome: string | null;
  total: string | number;
  criado_em: string;
  ifood_order_id: string | null;
}

const POLL_MS = 8000;

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

  async function recusar(id: string) {
    const reason = window.prompt("Motivo da recusa:", "Item indisponível");
    if (!reason) return;
    setAcao({ id, tipo: "recusar" }); setErro(null);
    try {
      const r = await fetch(`/api/painel/ifood/pedidos/${id}/recusar`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ reason }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data?.error || "Falha ao recusar");
      setPedidos((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setAcao(null);
    }
  }

  if (pedidos.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {erro && (
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
                onClick={() => recusar(p.id)}
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
  );
}
