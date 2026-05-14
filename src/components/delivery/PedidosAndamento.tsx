"use client";

/**
 * Lista pedidos delivery em andamento (pronto / em rota / saiu_entrega).
 * Auto-refresh a cada 15s.
 */
import { useEffect, useState, useCallback } from "react";
import { Bike, Clock, MapPin, Phone, RefreshCw, MessageCircle, User, ExternalLink } from "lucide-react";

interface Pedido {
  id: string; numero: number; status: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_endereco: { rua?: string; numero?: string; bairro?: string; cep?: string } | null;
  total: number; taxa_entrega: number;
  motoboy_id: string | null;
  motoboy_nome: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  pronto:       "Pronto",
  preparando:   "Preparando",
  em_rota:      "Em rota",
  saiu_entrega: "Saiu pra entrega",
};

const STATUS_COR: Record<string, string> = {
  pronto:       "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  preparando:   "bg-amber-500/15 text-amber-300 border-amber-500/30",
  em_rota:      "bg-blue-500/15 text-blue-300 border-blue-500/30",
  saiu_entrega: "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

const fmtBRL = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtTempo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}min`;
};

export function PedidosAndamento() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const t = localStorage.getItem("access_token") ?? "";
      // Busca pedidos do tipo delivery em status ativos
      const r = await fetch("/api/pedidos?tipo=delivery&status=pronto,preparando,em_rota,saiu_entrega&limit=50", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const d = await r.json();
      if (d.success) setPedidos(d.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    carregar();
    const i = setInterval(carregar, 15_000);
    return () => clearInterval(i);
  }, [carregar]);

  if (loading && pedidos.length === 0) {
    return <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-slate-500">Carregando pedidos...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
          <Bike className="h-4 w-4" />
          Pedidos em andamento ({pedidos.length})
        </h3>
        <button onClick={carregar}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/5">
          <RefreshCw className={`h-3 w-3 inline ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {pedidos.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
          <Bike className="h-8 w-8 mx-auto text-slate-500 mb-2" />
          <p className="text-sm text-slate-500">Sem pedidos delivery em andamento</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pedidos.map(p => {
            const end = p.cliente_endereco;
            const enderecoStr = end ? [end.rua, end.numero, end.bairro].filter(Boolean).join(", ") : "(sem endereço)";
            return (
              <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-start gap-3">
                <div className="flex-shrink-0">
                  <p className="text-2xl font-bold text-white">#{p.numero}</p>
                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {fmtTempo(p.created_at)}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${STATUS_COR[p.status] ?? "bg-slate-700"}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                    <span className="text-sm font-bold text-white">{fmtBRL(p.total)}</span>
                    {Number(p.taxa_entrega) > 0 && (
                      <span className="text-xs text-slate-400">+ taxa {fmtBRL(p.taxa_entrega)}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-300 truncate">
                    <User className="inline h-3 w-3 mr-1 text-slate-500" />
                    {p.cliente_nome ?? "—"}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    <MapPin className="inline h-3 w-3 mr-1 text-slate-500" />
                    {enderecoStr}
                  </p>
                  {p.motoboy_nome ? (
                    <p className="text-xs text-blue-400 mt-1">🛵 {p.motoboy_nome}</p>
                  ) : (
                    <p className="text-xs text-amber-400 mt-1">⚠ Sem motoboy atribuído</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {p.cliente_telefone && (
                    <>
                      <a href={`tel:${p.cliente_telefone}`} title="Ligar"
                        className="rounded-lg border border-white/10 p-1.5 text-emerald-400 hover:bg-emerald-500/10">
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                      <a href={`https://wa.me/${p.cliente_telefone.startsWith("+") ? p.cliente_telefone.replace(/\D/g, "") : "55" + p.cliente_telefone.replace(/\D/g, "")}`}
                        target="_blank" rel="noopener noreferrer" title="WhatsApp"
                        className="rounded-lg border border-white/10 p-1.5 text-green-400 hover:bg-green-500/10">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    </>
                  )}
                  <a href={`/painel/pedidos`} title="Ver no painel"
                    className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
