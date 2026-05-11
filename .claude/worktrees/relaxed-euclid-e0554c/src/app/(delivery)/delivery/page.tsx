"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Bike, MapPin, Clock, Phone, CheckCircle,
  RefreshCw, Package, AlertCircle, Navigation,
} from "lucide-react";

interface PedidoDelivery {
  id:               string;
  numero:           number;
  status:           string;
  total:            number;
  cliente_nome:     string | null;
  cliente_telefone: string | null;
  cliente_endereco: {
    logradouro:  string;
    numero:      string;
    bairro:      string;
    cidade:      string;
    complemento?: string;
    referencia?:  string;
  } | null;
  motoboy_id:       string | null;
  motoboy_nome?:    string | null;
  taxa_entrega:     number;
  created_at:       string;
  tempo_espera_segundos: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pronto:    { label: "Pronto p/ Retirada", color: "text-emerald-400 bg-emerald-500/15" },
  entregue:  { label: "Entregue",           color: "text-slate-400 bg-slate-500/15"    },
  cancelado: { label: "Cancelado",          color: "text-red-400 bg-red-500/15"        },
};

export default function DeliveryPage() {
  const [pedidos, setPedidos] = useState<PedidoDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [token,   setToken]   = useState("");

  useEffect(() => {
    const t = localStorage.getItem("access_token") || "";
    setToken(t);
    if (!t) window.location.href = "/login";
  }, []);

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/pedidos?tipo=delivery&limit=50", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPedidos(data.data);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) carregar();
    const interval = setInterval(carregar, 20_000);
    return () => clearInterval(interval);
  }, [token, carregar]);

  async function atribuirMotoboy(pedidoId: string) {
    // Abre modal de seleção de motoboy
    console.log("Atribuir motoboy:", pedidoId);
  }

  async function marcarEntregue(pedidoId: string) {
    await fetch(`/api/pedidos/${pedidoId}/status`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ status: "entregue" }),
    });
    carregar();
  }

  const prontos    = pedidos.filter((p) => p.status === "pronto");
  const emRota     = pedidos.filter((p) => p.status === "entregue" && p.motoboy_id);
  const historico  = pedidos.filter((p) => p.status === "entregue" || p.status === "cancelado");

  return (
    <div className="min-h-screen bg-slate-950 pb-8 text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-slate-900/95 backdrop-blur">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Bike className="h-5 w-5 text-blue-400" />
            <div>
              <h1 className="font-bold">Delivery</h1>
              <p className="text-xs text-slate-400">
                {prontos.length} prontos · {emRota.length} em rota
              </p>
            </div>
          </div>
          <button
            onClick={carregar}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10"
          >
            <RefreshCw className={`h-4 w-4 text-slate-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="space-y-6 p-5">
        {/* Prontos p/ retirada */}
        {prontos.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <Package className="h-4 w-4" />
              Prontos para retirada ({prontos.length})
            </h2>

            <div className="space-y-3">
              {prontos.map((pedido) => (
                <motion.div
                  key={pedido.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-white">
                        #{pedido.numero} · {pedido.cliente_nome || "—"}
                      </p>
                      {pedido.cliente_telefone && (
                        <a
                          href={`tel:${pedido.cliente_telefone}`}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400"
                        >
                          <Phone className="h-3 w-3" />
                          {pedido.cliente_telefone}
                        </a>
                      )}
                    </div>
                    <span className="text-sm font-bold text-white">
                      {pedido.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>

                  {pedido.cliente_endereco && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/5 p-3">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
                      <div className="text-xs text-slate-300">
                        <p>
                          {pedido.cliente_endereco.logradouro}, {pedido.cliente_endereco.numero}
                          {pedido.cliente_endereco.complemento && ` — ${pedido.cliente_endereco.complemento}`}
                        </p>
                        <p className="text-slate-400">
                          {pedido.cliente_endereco.bairro} · {pedido.cliente_endereco.cidade}
                        </p>
                        {pedido.cliente_endereco.referencia && (
                          <p className="mt-0.5 italic text-amber-400">
                            Ref: {pedido.cliente_endereco.referencia}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    {!pedido.motoboy_id ? (
                      <button
                        onClick={() => atribuirMotoboy(pedido.id)}
                        className="flex-1 rounded-xl bg-blue-500 py-2 text-sm font-semibold text-white transition hover:bg-blue-400"
                      >
                        Atribuir Motoboy
                      </button>
                    ) : (
                      <button
                        onClick={() => marcarEntregue(pedido.id)}
                        className="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
                      >
                        ✓ Confirmar Entrega
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {pedidos.length === 0 && !loading && (
          <div className="flex flex-col items-center py-20 text-slate-500">
            <Bike className="mb-3 h-12 w-12 text-blue-500/30" />
            <p className="text-base font-medium text-slate-400">Sem entregas</p>
            <p className="text-sm">Nenhum pedido delivery hoje</p>
          </div>
        )}
      </div>
    </div>
  );
}
