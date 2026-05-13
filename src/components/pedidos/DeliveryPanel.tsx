"use client";

/**
 * DeliveryPanel — exibido dentro do modal de pedido para tipo=delivery.
 *
 * Funcionalidade:
 *   - Mostra zona, motoboy atribuído (com telefone)
 *   - Select de motoboy (lista os disponíveis) + botão Atribuir
 *   - Botões para mudar status_entrega rapidamente
 *   - Link "ver rastreamento do cliente" (abre /rastrear/[token])
 */
import { useEffect, useState, useCallback } from "react";
import { Bike, ExternalLink, Loader2, MapPin } from "lucide-react";

interface MotoboyMin {
  id:       string;
  nome:     string;
  telefone: string | null;
  status:   string;
}
interface PedidoMin {
  id:               string;
  motoboy_id:       string | null;
  motoboy_nome:     string | null;
  motoboy_telefone: string | null;
  zona_nome:        string | null;
  status_entrega:   string | null;
  tracking_token:   string | null;
  valor_motoboy:    number | string | null;
}

const STATUS_LABELS: Record<string, string> = {
  aguardando: "Aguardando entregador",
  atribuido:  "Atribuído",
  coletado:   "Coletado",
  em_rota:    "Em rota",
  entregue:   "Entregue",
  cancelado:  "Cancelado",
};

const fmtBRL = (v: number | string | null) =>
  v == null ? "—"
  : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export function DeliveryPanel({ pedido, onUpdate }: {
  pedido: PedidoMin;
  onUpdate: () => void;
}) {
  const [motoboys, setMotoboys] = useState<MotoboyMin[]>([]);
  const [selectedId, setSelectedId] = useState<string>(pedido.motoboy_id ?? "");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarMotoboys = useCallback(async () => {
    const t = localStorage.getItem("access_token") ?? "";
    const r = await fetch("/api/painel/motoboys", { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    if (d.success) setMotoboys((d.data ?? []).filter((m: MotoboyMin) => m.status !== "inativo"));
  }, []);

  useEffect(() => { carregarMotoboys(); }, [carregarMotoboys]);

  async function atribuir() {
    setLoading(true); setErro(null);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch(`/api/pedidos/${pedido.id}/atribuir-motoboy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ motoboy_id: selectedId || null }),
      });
      const d = await r.json();
      if (!d.success) { setErro(d.error?.message ?? "Falha"); return; }
      onUpdate();
    } finally { setLoading(false); }
  }

  async function mudarStatus(status: string) {
    setLoading(true); setErro(null);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch(`/api/pedidos/${pedido.id}/status-entrega`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ status }),
      });
      const d = await r.json();
      if (!d.success) { setErro(d.error?.message ?? "Falha"); return; }
      onUpdate();
    } finally { setLoading(false); }
  }

  const statusAtual = pedido.status_entrega ?? "aguardando";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
        <Bike className="h-4 w-4" />
        Entrega
        <span className="ml-auto rounded bg-amber-500/15 px-2 py-0.5 text-[10px]">
          {STATUS_LABELS[statusAtual] ?? statusAtual}
        </span>
      </div>

      {/* Zona */}
      {pedido.zona_nome && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <MapPin className="h-3.5 w-3.5" />
          Zona: <span className="text-white">{pedido.zona_nome}</span>
          {pedido.valor_motoboy && Number(pedido.valor_motoboy) > 0 && (
            <span className="ml-auto text-amber-400">
              Motoboy ganha {fmtBRL(pedido.valor_motoboy)}
            </span>
          )}
        </div>
      )}

      {/* Atribuir motoboy */}
      <div className="flex items-center gap-2">
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-amber-500/50 focus:outline-none"
        >
          <option value="">— Sem motoboy —</option>
          {motoboys.map(m => (
            <option key={m.id} value={m.id}>
              {m.nome}{m.telefone ? ` · ${m.telefone}` : ""}
            </option>
          ))}
        </select>
        <button
          onClick={atribuir}
          disabled={loading || selectedId === (pedido.motoboy_id ?? "")}
          className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-40"
        >
          {loading ? "..." : "Atribuir"}
        </button>
      </div>

      {/* Status quick actions */}
      {pedido.motoboy_id && (
        <div className="flex flex-wrap gap-2">
          {statusAtual === "atribuido" && (
            <button onClick={() => mudarStatus("coletado")} disabled={loading}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20">
              Marcar coletado
            </button>
          )}
          {(statusAtual === "coletado" || statusAtual === "em_rota") && (
            <button onClick={() => mudarStatus("entregue")} disabled={loading}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20">
              Marcar entregue
            </button>
          )}
          {pedido.motoboy_telefone && (
            <a href={`tel:${pedido.motoboy_telefone.replace(/\D/g, "")}`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10">
              Ligar motoboy
            </a>
          )}
        </div>
      )}

      {/* Tracking */}
      {pedido.tracking_token && (
        <a
          href={`/rastrear/${pedido.tracking_token}`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-white"
        >
          <ExternalLink className="h-3 w-3" />
          Ver rastreamento do cliente
        </a>
      )}

      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </div>
  );
}
