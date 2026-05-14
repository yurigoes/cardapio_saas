"use client";

/**
 * /motoboy — PWA do entregador
 *
 * - Lista pedidos atribuídos
 * - Botões: "Coletei", "Entreguei"
 * - Liga geolocation watchPosition (GPS) → ping a cada ~20s
 * - Cada pedido tem botão "Abrir no Maps" que linka pra navegação nativa
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bike, MapPin, Navigation, Phone, CheckCircle2, Package,
  LogOut, RefreshCw, Loader2, Wifi, WifiOff, DollarSign,
} from "lucide-react";
import { FecharContaModal } from "@/components/pedidos/FecharContaModal";
import { alertar } from "@/components/ui/ConfirmModal";

interface Endereco {
  rua?: string; numero?: string; complemento?: string;
  bairro?: string; cidade?: string; uf?: string; cep?: string; referencia?: string;
}
interface PedidoMb {
  id: string; numero: number | null; total: string;
  status_entrega: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_endereco: Endereco | null;
  tracking_token: string | null;
  atribuido_em: string | null; coletado_em: string | null;
  valor_motoboy: string | null;
  zona_nome: string | null;
  forma_pagamento: string | null;
  pago: boolean;     // computado: true se pedido_pagamentos existe
}

const fmtBRL = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export default function MotoboyPage() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<PedidoMb[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [pagandoPedido, setPagandoPedido] = useState<PedidoMb | null>(null);
  const [resumo, setResumo] = useState<{
    corridas_hoje: number; total_hoje: number; em_aberto: number; tempo_medio_min: number;
  } | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; precisao?: number } | null>(null);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [pingErro, setPingErro] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPingRef = useRef<number>(0);

  // Auth check
  useEffect(() => {
    const t = localStorage.getItem("access_token");
    if (!t) router.push("/login");
  }, [router]);

  // Carrega pedidos + resumo do dia
  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const t = localStorage.getItem("access_token");
      const headers = { Authorization: `Bearer ${t}` };
      const [rPed, rRes] = await Promise.all([
        fetch("/api/motoboy/pedidos", { headers }),
        fetch("/api/motoboy/resumo",  { headers }),
      ]);
      const dPed = await rPed.json();
      const dRes = await rRes.json();
      if (dPed.success) setPedidos(dPed.data.pedidos ?? []);
      if (dRes.success) setResumo(dRes.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const id = setInterval(carregar, 30_000);
    return () => clearInterval(id);
  }, [carregar]);

  // GPS
  function pingLocalizacao(lat: number, lng: number, precisao?: number) {
    const agora = Date.now();
    if (agora - lastPingRef.current < 15_000) return;     // throttle 15s
    lastPingRef.current = agora;

    const t = localStorage.getItem("access_token");
    fetch("/api/motoboy/localizacao", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body:    JSON.stringify({ lat, lng, precisao_m: precisao }),
    })
      .then(r => r.json())
      .then(d => { if (!d.success) setPingErro(d.error?.message ?? "Falha ping"); else setPingErro(null); })
      .catch(() => setPingErro("Sem internet"));
  }

  function ligarGps() {
    if (!navigator.geolocation) {
      setPingErro("GPS não suportado neste dispositivo");
      return;
    }
    if (watchIdRef.current !== null) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setCoords({ lat: latitude, lng: longitude, precisao: accuracy });
        setGpsEnabled(true);
        pingLocalizacao(latitude, longitude, accuracy);
      },
      (err) => {
        setPingErro(`GPS: ${err.message}`);
        setGpsEnabled(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );
    watchIdRef.current = id;
  }
  function desligarGps() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsEnabled(false);
  }
  useEffect(() => () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); }, []);

  // Atualiza status do pedido
  async function atualizarStatus(pedidoId: string, status: "coletado" | "em_rota" | "entregue") {
    setUpdating(pedidoId);
    try {
      const t = localStorage.getItem("access_token");
      const r = await fetch(`/api/pedidos/${pedidoId}/status-entrega`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ status }),
      });
      const d = await r.json();
      if (d.success) carregar();
      else await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
    } finally { setUpdating(null); }
  }

  function abrirNoMaps(end: Endereco) {
    const q = [end.rua, end.numero, end.bairro, end.cidade, end.uf, end.cep].filter(Boolean).join(", ");
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    window.open(url, "_blank");
  }

  function logout() {
    desligarGps();
    localStorage.removeItem("access_token");
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-900/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Bike className="h-5 w-5 text-orange-400" />
        <h1 className="text-base font-bold">Entregas</h1>
        <span className="ml-auto text-xs">
          {gpsEnabled ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <Wifi className="h-3.5 w-3.5" /> GPS ativo
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-500">
              <WifiOff className="h-3.5 w-3.5" /> GPS off
            </span>
          )}
        </span>
        <button onClick={carregar} disabled={loading} className="text-slate-400 hover:text-white p-1">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button onClick={logout} className="text-slate-400 hover:text-red-400 p-1">
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {/* GPS toggle */}
      <div className="p-4">
        {!gpsEnabled ? (
          <button
            onClick={ligarGps}
            className="w-full rounded-2xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/10 p-5 text-center"
          >
            <Navigation className="h-8 w-8 mx-auto text-emerald-400 mb-2" />
            <p className="text-base font-bold text-emerald-300">Ligar GPS</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Permite ao cliente acompanhar sua localização em tempo real
            </p>
          </button>
        ) : (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-emerald-300">GPS ligado · {coords && `±${Math.round(coords.precisao ?? 0)}m`}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "aguardando sinal..."}
              </p>
            </div>
            <button onClick={desligarGps} className="text-xs text-slate-400 hover:text-white">Desligar</button>
          </div>
        )}
        {pingErro && (
          <p className="mt-2 text-xs text-red-400 text-center">{pingErro}</p>
        )}
      </div>

      {/* Resumo do dia */}
      {resumo && (resumo.corridas_hoje > 0 || resumo.em_aberto > 0) && (
        <div className="px-4 pb-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400">Hoje</p>
              <p className="text-2xl font-bold text-white mt-0.5">{resumo.corridas_hoje}</p>
              <p className="text-[10px] text-slate-500">corridas</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-amber-400">A receber</p>
              <p className="text-xl font-bold text-white mt-0.5">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(resumo.total_hoje)}
              </p>
              <p className="text-[10px] text-slate-500">do dia</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Em aberto</p>
              <p className="text-2xl font-bold text-white mt-0.5">{resumo.em_aberto}</p>
              <p className="text-[10px] text-slate-500">
                {resumo.tempo_medio_min > 0 ? `~${resumo.tempo_medio_min}min/entrega` : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pedidos */}
      <div className="px-4 space-y-3">
        {loading && pedidos.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
          </div>
        ) : pedidos.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="h-12 w-12 mx-auto text-slate-700 mb-3" />
            <p className="text-sm text-slate-500">Nenhuma entrega atribuída</p>
            <p className="text-[11px] text-slate-600 mt-1">Aguarde novas atribuições</p>
          </div>
        ) : (
          pedidos.map(p => {
            const end = p.cliente_endereco ?? {};
            const enderecoStr = end.rua
              ? `${end.rua}, ${end.numero ?? "s/n"}${end.bairro ? ` — ${end.bairro}` : ""}`
              : "(sem endereço)";
            return (
              <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Pedido #{p.numero}</p>
                    <p className="text-base font-bold text-white truncate">{p.cliente_nome ?? "(sem nome)"}</p>
                    {p.zona_nome && <p className="text-[11px] text-slate-500">{p.zona_nome}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-emerald-400">{fmtBRL(p.total)}</p>
                    {Number(p.valor_motoboy) > 0 && (
                      <p className="text-[10px] text-amber-400">+{fmtBRL(p.valor_motoboy)} pra você</p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-slate-900/50 p-2.5">
                  <MapPin className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 text-xs">
                    <p className="text-slate-300">{enderecoStr}</p>
                    {end.complemento && <p className="text-[11px] text-slate-500">{end.complemento}</p>}
                    {end.referencia && <p className="text-[11px] text-amber-400 italic">📍 {end.referencia}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => abrirNoMaps(end)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 py-2.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/20"
                  >
                    <Navigation className="h-3.5 w-3.5" /> Navegar
                  </button>
                  {p.cliente_telefone ? (
                    <a
                      href={`tel:${p.cliente_telefone.replace(/\D/g, "")}`}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                    >
                      <Phone className="h-3.5 w-3.5" /> Ligar
                    </a>
                  ) : <div />}
                </div>
                {p.cliente_telefone && (
                  <a
                    href={`https://wa.me/${(p.cliente_telefone.startsWith("+") ? "" : "55") + p.cliente_telefone.replace(/\D/g, "")}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 py-2.5 text-xs font-semibold text-green-300 hover:bg-green-500/20"
                  >
                    💬 WhatsApp
                  </a>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {p.status_entrega === "atribuido" && (
                    <button
                      onClick={() => atualizarStatus(p.id, "coletado")}
                      disabled={updating === p.id}
                      className="col-span-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                    >
                      {updating === p.id ? "..." : "✓ Coletei o pedido"}
                    </button>
                  )}
                  {(p.status_entrega === "coletado" || p.status_entrega === "em_rota") && (
                    <>
                      {/* Se tem cobrança pendente (pagar_entrega ou simplesmente sem pagamento), abre modal */}
                      {(p.forma_pagamento === "pagar_entrega" || !p.pago) ? (
                        <button
                          onClick={() => setPagandoPedido(p)}
                          disabled={updating === p.id}
                          className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                        >
                          <DollarSign className="h-4 w-4" />
                          Receber e entregar
                        </button>
                      ) : (
                        <button
                          onClick={() => atualizarStatus(p.id, "entregue")}
                          disabled={updating === p.id}
                          className="col-span-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                        >
                          {updating === p.id ? "..." : "🎉 Entreguei!"}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {p.tracking_token && (
                  <a
                    href={`/rastrear/${p.tracking_token}`}
                    target="_blank" rel="noopener noreferrer"
                    className="block text-center text-[10px] text-slate-500 hover:text-white"
                  >
                    Visão do cliente →
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal de pagamento — abre ao "Receber e entregar" */}
      {pagandoPedido && (
        <FecharContaModal
          pedido={{
            id:           pagandoPedido.id,
            numero:       pagandoPedido.numero,
            total:        Number(pagandoPedido.total),
            cliente_nome: pagandoPedido.cliente_nome,
          }}
          open={true}
          authToken={localStorage.getItem("access_token") ?? ""}
          onClose={() => setPagandoPedido(null)}
          onClosed={async () => {
            const id = pagandoPedido.id;
            setPagandoPedido(null);
            // Após receber pagamento, marca delivery como entregue
            await atualizarStatus(id, "entregue");
          }}
        />
      )}
    </div>
  );
}
