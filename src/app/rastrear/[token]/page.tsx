"use client";

/**
 * /rastrear/[token] — página pública para o cliente acompanhar entrega
 * Polling a cada 15s (suficiente; motoboy pinga a cada 20s).
 */
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Bike, MapPin, Clock, Phone, CheckCircle2, Truck } from "lucide-react";
import { MapaTracking, type PinPoint } from "@/components/delivery/MapaTracking";

interface Rastreio {
  pedido: {
    id: string; numero: number | null; status: string;
    status_entrega: string | null;
    cliente_nome: string | null;
    endereco: Record<string, string> | null;
    total: number;
    atribuido_em: string | null; coletado_em: string | null; entregue_em: string | null;
  };
  empresa: {
    nome: string; whatsapp: string | null;
    lat: number | null; lng: number | null;
  };
  motoboy: {
    id: string; nome: string | null; telefone: string | null;
    lat: number | null; lng: number | null;
    atualizado_em: string | null;
  } | null;
}

const STATUS_INFO: Record<string, { label: string; color: string; pct: number }> = {
  aguardando: { label: "Buscando entregador",   color: "text-slate-400",   pct: 25  },
  atribuido:  { label: "Entregador a caminho",  color: "text-blue-400",    pct: 45  },
  coletado:   { label: "Pedido em rota",        color: "text-amber-400",   pct: 65  },
  em_rota:    { label: "Em rota",               color: "text-amber-400",   pct: 80  },
  entregue:   { label: "Entregue!",             color: "text-emerald-400", pct: 100 },
  cancelado:  { label: "Cancelado",             color: "text-red-400",     pct: 0   },
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function RastrearPage() {
  const params = useParams<{ token: string }>();
  const [data, setData]       = useState<Rastreio | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`/api/pub/rastrear/${params.token}`);
      if (r.status === 404) { setError("Pedido não encontrado"); return; }
      const d = await r.json();
      if (d.success) {
        setData(d.data);
        setError(null);
      } else {
        setError(d.error?.message ?? "Erro");
      }
    } catch {
      setError("Sem conexão");
    } finally { setLoading(false); }
  }, [params.token]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15_000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
        <p className="text-lg font-bold text-red-400">{error}</p>
        <p className="mt-2 text-sm text-slate-500">Verifique o link de rastreamento.</p>
      </div>
    );
  }

  if (!data) return null;

  const sts = STATUS_INFO[data.pedido.status_entrega ?? "aguardando"]
            ?? STATUS_INFO.aguardando;
  const ent = data.pedido.endereco ?? {};

  // Pinos do mapa
  const origem: PinPoint | null = data.empresa.lat && data.empresa.lng
    ? { lat: data.empresa.lat, lng: data.empresa.lng, label: data.empresa.nome, color: "green" }
    : null;
  const motoboy: PinPoint | null = data.motoboy?.lat && data.motoboy?.lng
    ? { lat: data.motoboy.lat, lng: data.motoboy.lng, label: data.motoboy.nome ?? "Entregador", color: "orange" }
    : null;
  // Destino: sem geocoding dá pra mostrar o pino se tiver lat/lng salvos
  // (atualmente endereço é texto, sem geocode — pino fica omitido)
  const destino: PinPoint | null = null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900 px-5 py-4">
        <p className="text-xs text-slate-500">Pedido #{data.pedido.numero ?? "?"}</p>
        <h1 className="text-lg font-bold text-white">{data.empresa.nome}</h1>
      </div>

      {/* Status */}
      <div className="p-5 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500">Status</span>
            <span className={`text-base font-bold ${sts.color}`}>{sts.label}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full transition-all duration-700 ${
                data.pedido.status_entrega === "entregue" ? "bg-emerald-500"
                : data.pedido.status_entrega === "cancelado" ? "bg-red-500"
                : "bg-amber-500"
              }`}
              style={{ width: `${sts.pct}%` }}
            />
          </div>

          {/* Timeline */}
          <div className="mt-5 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`h-3.5 w-3.5 ${data.pedido.atribuido_em ? "text-emerald-400" : "text-slate-700"}`} />
              <span className={data.pedido.atribuido_em ? "text-slate-300" : "text-slate-600"}>
                Entregador atribuído {data.pedido.atribuido_em && `· ${fmtTime(data.pedido.atribuido_em)}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`h-3.5 w-3.5 ${data.pedido.coletado_em ? "text-emerald-400" : "text-slate-700"}`} />
              <span className={data.pedido.coletado_em ? "text-slate-300" : "text-slate-600"}>
                Pedido coletado {data.pedido.coletado_em && `· ${fmtTime(data.pedido.coletado_em)}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`h-3.5 w-3.5 ${data.pedido.entregue_em ? "text-emerald-400" : "text-slate-700"}`} />
              <span className={data.pedido.entregue_em ? "text-slate-300" : "text-slate-600"}>
                Entregue ao cliente {data.pedido.entregue_em && `· ${fmtTime(data.pedido.entregue_em)}`}
              </span>
            </div>
          </div>
        </div>

        {/* Mapa */}
        {(origem || motoboy) && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <MapaTracking origem={origem} motoboy={motoboy} destino={destino} height={280} />
            {motoboy && data.motoboy?.atualizado_em && (
              <p className="mt-2 text-[10px] text-slate-500 text-center">
                Última atualização do entregador: {new Date(data.motoboy.atualizado_em).toLocaleTimeString("pt-BR")}
              </p>
            )}
          </div>
        )}

        {/* Motoboy */}
        {data.motoboy && (
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center">
              <Bike className="h-5 w-5 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{data.motoboy.nome ?? "Entregador"}</p>
              <p className="text-xs text-slate-400">{data.motoboy.telefone ?? "—"}</p>
            </div>
            {data.motoboy.telefone && (
              <a
                href={`tel:${data.motoboy.telefone.replace(/\D/g, "")}`}
                className="rounded-full bg-orange-500 p-2 text-white hover:brightness-110"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
        )}

        {/* Endereço */}
        {ent.rua && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <MapPin className="h-3.5 w-3.5" />
              Endereço de entrega
            </div>
            <p className="text-sm text-white">{ent.rua}, {ent.numero}{ent.complemento ? ` — ${ent.complemento}` : ""}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {[ent.bairro, ent.cidade, ent.uf].filter(Boolean).join(" · ")}
              {ent.cep && ` · CEP ${ent.cep}`}
            </p>
            {ent.referencia && <p className="text-[11px] text-slate-500 mt-1.5 italic">{ent.referencia}</p>}
          </div>
        )}

        {/* Total */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center justify-between">
          <span className="text-sm text-slate-300">Total do pedido</span>
          <span className="text-2xl font-bold text-emerald-400">{fmtBRL(data.pedido.total)}</span>
        </div>

        <p className="text-center text-[10px] text-slate-600">
          Atualiza automaticamente a cada 15 segundos
        </p>
      </div>
    </div>
  );
}
