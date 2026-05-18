"use client";

/**
 * /p/[id] — Página pública de acompanhamento de pedido.
 *
 * Cliente acessa via QR code (impresso no cupom) ou link no WhatsApp.
 * Mostra status atual + itens. Sem login. Polling 10s pra atualizações.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2, ChefHat, Bike, Package, AlertCircle, Loader2, Clock,
} from "lucide-react";

interface PedidoStatus {
  numero:       number;
  status:       string;
  status_entrega?: string | null;
  cliente_id?:  string | null;
  cliente_nome: string | null;
  cliente_pontos?:    number | null;
  cliente_pontos_ganhos_pedido?: number | null;
  total:        string | number;
  empresa_id?:  string;
  empresa_slug?: string;
  empresa_nome: string;
  empresa_logo: string | null;
  empresa_cor?: string | null;
  tipo_consumo: string | null;
  itens:        Array<{ nome: string; quantidade: number; preco_unitario: number }>;
  created_at:   string;
  estimado_em?: number; // minutos
}

const STEPS = [
  { id: "pendente",    label: "Recebido",       icon: Package },
  { id: "confirmado",  label: "Confirmado",     icon: CheckCircle2 },
  { id: "em_preparo",  label: "Em preparo",     icon: ChefHat },
  { id: "pronto",      label: "Pronto pra retirada", icon: CheckCircle2 },
  { id: "entregue",    label: "Entregue",       icon: CheckCircle2 },
];

const STEPS_DELIVERY = [
  { id: "pendente",     label: "Recebido",          icon: Package },
  { id: "confirmado",   label: "Confirmado",        icon: CheckCircle2 },
  { id: "em_preparo",   label: "Em preparo",        icon: ChefHat },
  { id: "pronto",       label: "Pronto",            icon: CheckCircle2 },
  { id: "saiu_entrega", label: "Saiu pra entrega",  icon: Bike },
  { id: "entregue",     label: "Entregue",          icon: CheckCircle2 },
];

// Alguns sistemas legados usam nomes diferentes — normaliza pra o canônico
const ALIAS: Record<string, string> = {
  preparo:    "em_preparo",
  preparando: "em_preparo",
  enviado:    "saiu_entrega",
  em_rota:    "saiu_entrega",
  coletado:   "saiu_entrega",
  atribuido:  "saiu_entrega",
  aceito:     "confirmado",
};

export default function PedidoStatusPage() {
  const params = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<PedidoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState<string | null>(null);

  async function carregar() {
    try {
      const r = await fetch(`/api/pub/pedido-status/${params.id}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setErro(d?.error ?? "Pedido não encontrado");
        return;
      }
      setPedido(d.data);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (erro || !pedido) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div>
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-white">Pedido não encontrado</h1>
          <p className="text-sm text-slate-400 mt-1">{erro}</p>
        </div>
      </div>
    );
  }

  // Calcula status canônico considerando status principal + status_entrega
  // Pra delivery: se status='entregue' usa entregue; se status_entrega='atribuido'/'coletado'/'em_rota'
  // → considera saiu_entrega mesmo se o status principal ainda for 'pronto'/'em_preparo'
  let statusCanon = ALIAS[pedido.status] ?? pedido.status;
  if (pedido.tipo_consumo === "delivery" && pedido.status_entrega) {
    const se = pedido.status_entrega;
    if (se === "entregue") statusCanon = "entregue";
    else if (["atribuido","coletado","em_rota"].includes(se) && statusCanon !== "entregue") {
      statusCanon = "saiu_entrega";
    }
  }
  const status = statusCanon;
  const isDelivery = pedido.tipo_consumo === "delivery";
  const steps = isDelivery ? STEPS_DELIVERY : STEPS;

  const iCurrent = steps.findIndex(s => s.id === status);
  const total = typeof pedido.total === "string" ? parseFloat(pedido.total) : pedido.total;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header — logo absoluta sem caixinha */}
      <header className="border-b border-white/10 bg-slate-900/50 px-4 py-5">
        <div className="max-w-md mx-auto flex items-center gap-4">
          {pedido.empresa_logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pedido.empresa_logo}
              alt={pedido.empresa_nome}
              className="h-14 w-auto max-w-[180px] object-contain"
              style={{ maxHeight: 56 }}
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <ChefHat className="h-6 w-6 text-emerald-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{pedido.empresa_nome}</p>
            <h1 className="text-lg font-bold leading-tight">Pedido #{pedido.numero}</h1>
            <p className="text-[10px] text-slate-600">Atualizando a cada 10s</p>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Status */}
        {pedido.status === "cancelado" ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-2" />
            <h2 className="font-bold text-red-300">Pedido cancelado</h2>
            <p className="text-xs text-slate-400 mt-1">Em caso de dúvidas, entre em contato com o restaurante.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Acompanhe seu pedido</h2>
            <div className="space-y-3">
              {steps.map((s, i) => {
                const Icon = s.icon;
                const done    = i <= iCurrent;
                const current = i === iCurrent;
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full ${
                      done ? "bg-emerald-500" : "bg-slate-800 border border-white/10"
                    } ${current ? "animate-pulse ring-2 ring-emerald-400/50" : ""}`}>
                      {current && pedido.status !== "entregue"
                        ? <Loader2 className="h-4 w-4 animate-spin text-white" />
                        : <Icon className={`h-4 w-4 ${done ? "text-white" : "text-slate-500"}`} />}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${
                        current ? "text-emerald-400" :
                        done    ? "text-white"      :
                                  "text-slate-500"
                      }`}>{s.label}</p>
                      {current && (
                        <p className="text-[10px] text-slate-500">
                          <Clock className="inline h-3 w-3 mr-1" />
                          atualizado agora
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Itens */}
        <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Seu pedido</h2>
          <div className="space-y-2">
            {pedido.itens?.map((it, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-300">{it.quantidade}x {it.nome}</span>
                <span className="text-slate-400">
                  R$ {(it.quantidade * it.preco_unitario).toFixed(2).replace(".", ",")}
                </span>
              </div>
            ))}
            <div className="border-t border-white/5 pt-2 flex justify-between text-sm font-bold">
              <span>Total</span>
              <span className="text-emerald-400">R$ {(isFinite(total) ? total : 0).toFixed(2).replace(".", ",")}</span>
            </div>
          </div>
        </div>

        {/* Bloco de pontos — só se cliente cadastrado */}
        {pedido.cliente_id && pedido.cliente_pontos !== null && pedido.cliente_pontos !== undefined && (
          <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20">
                <span className="text-2xl">⭐</span>
              </div>
              <div className="flex-1">
                <p className="text-xs uppercase tracking-wider text-amber-300/80">Seus pontos</p>
                <p className="text-2xl font-black text-amber-200">{pedido.cliente_pontos.toLocaleString("pt-BR")}</p>
                {pedido.cliente_pontos_ganhos_pedido !== undefined && pedido.cliente_pontos_ganhos_pedido !== null && pedido.cliente_pontos_ganhos_pedido > 0 && (
                  <p className="text-[11px] text-emerald-300 mt-0.5">
                    + {pedido.cliente_pontos_ganhos_pedido} pontos com este pedido
                  </p>
                )}
              </div>
            </div>
            {pedido.empresa_slug && (
              <a href={`/cliente?empresa=${pedido.empresa_slug}`}
                className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/30">
                Ver meus cupons e pontos →
              </a>
            )}
          </div>
        )}

        {pedido.cliente_nome && (
          <p className="text-center text-xs text-slate-500">
            Pedido de <strong>{pedido.cliente_nome}</strong>
          </p>
        )}
      </main>
    </div>
  );
}
