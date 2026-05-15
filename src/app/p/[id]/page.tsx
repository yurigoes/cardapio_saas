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
  cliente_nome: string | null;
  total:        string | number;
  empresa_nome: string;
  empresa_logo: string | null;
  tipo_consumo: string | null;
  itens:        Array<{ nome: string; quantidade: number; preco_unitario: number }>;
  created_at:   string;
  estimado_em?: number; // minutos
}

const STEPS = [
  { id: "pendente",    label: "Recebido",       icon: Package },
  { id: "confirmado",  label: "Confirmado",     icon: CheckCircle2 },
  { id: "em_preparo",  label: "Em preparo",     icon: ChefHat },
  { id: "pronto",      label: "Pronto",         icon: CheckCircle2 },
  { id: "entregue",    label: "Entregue",       icon: CheckCircle2 },
];

const STEPS_DELIVERY = [
  { id: "pendente",     label: "Recebido",       icon: Package },
  { id: "confirmado",   label: "Confirmado",     icon: CheckCircle2 },
  { id: "em_preparo",   label: "Em preparo",     icon: ChefHat },
  { id: "saiu_entrega", label: "Saiu pra entrega", icon: Bike },
  { id: "entregue",     label: "Entregue",       icon: CheckCircle2 },
];

const ALIAS: Record<string, string> = {
  preparo: "em_preparo",
  enviado: "saiu_entrega",
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

  const status = ALIAS[pedido.status] ?? pedido.status;
  const isDelivery = pedido.tipo_consumo === "delivery";
  const steps = isDelivery ? STEPS_DELIVERY : STEPS;

  const iCurrent = steps.findIndex(s => s.id === status);
  const total = typeof pedido.total === "string" ? parseFloat(pedido.total) : pedido.total;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900/50 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {pedido.empresa_logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pedido.empresa_logo} alt={pedido.empresa_nome} className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <ChefHat className="h-5 w-5 text-emerald-400" />
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400">Pedido</p>
            <h1 className="text-lg font-bold">#{pedido.numero}</h1>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-slate-400">{pedido.empresa_nome}</p>
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

        {pedido.cliente_nome && (
          <p className="text-center text-xs text-slate-500">
            Pedido de <strong>{pedido.cliente_nome}</strong>
          </p>
        )}
      </main>
    </div>
  );
}
