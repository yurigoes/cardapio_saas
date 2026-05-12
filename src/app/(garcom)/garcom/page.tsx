"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Plus, RefreshCw, Clock, Users, CheckCircle,
  X, ShoppingBag, Send,
} from "lucide-react";

interface Mesa {
  id:                    string;
  numero:                number;
  nome:                  string | null;
  capacidade:            number;
  setor:                 string | null;
  status:                "livre" | "ocupada" | "reservada" | "interditada";
  pedido_id?:            string;
  pedido_numero?:        number;
  pedido_total?:         number;
  tempo_aberta_segundos?: number;
}

const STATUS_CONFIG = {
  livre:       { label: "Livre",       bg: "bg-brand/15", text: "text-brand", border: "border-brand/30" },
  ocupada:     { label: "Ocupada",     bg: "bg-amber-500/15",   text: "text-amber-400",   border: "border-amber-500/30"  },
  reservada:   { label: "Reservada",   bg: "bg-blue-500/15",    text: "text-blue-400",    border: "border-blue-500/30"   },
  interditada: { label: "Interditada", bg: "bg-red-500/15",     text: "text-red-400",     border: "border-red-500/30"    },
};

function formatTempo(segundos?: number): string {
  if (!segundos) return "";
  const mins = Math.floor(segundos / 60);
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h${mins % 60}min`;
}

export default function GarcomPage() {
  const [mesas,    setMesas]    = useState<Mesa[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [setor,    setSetor]    = useState<string | null>(null);
  const [token,    setToken]    = useState<string>("");

  useEffect(() => {
    const t = localStorage.getItem("access_token") || "";
    setToken(t);
    if (!t) { window.location.href = "/login"; }
  }, []);

  const carregarMesas = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/mesas", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setMesas(data.data);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) carregarMesas();
  }, [token, carregarMesas]);

  // Atualiza a cada 30 segundos
  useEffect(() => {
    const interval = setInterval(carregarMesas, 30_000);
    return () => clearInterval(interval);
  }, [carregarMesas]);

  const setores = Array.from(new Set(mesas.map((m) => m.setor).filter(Boolean))) as string[];

  const mesasFiltradas = setor
    ? mesas.filter((m) => m.setor === setor)
    : mesas;

  const livre   = mesas.filter((m) => m.status === "livre").length;
  const ocupada = mesas.filter((m) => m.status === "ocupada").length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-slate-900/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-base font-bold">Mesas</h1>
            <p className="text-xs text-slate-400">
              {livre} livres · {ocupada} ocupadas
            </p>
          </div>
          <button
            onClick={carregarMesas}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 transition hover:border-white/20"
          >
            <RefreshCw className={`h-4 w-4 text-slate-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Filtro de setores */}
        {setores.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3">
            <button
              onClick={() => setSetor(null)}
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                setor === null
                  ? "bg-brand text-white"
                  : "border border-white/10 text-slate-400 hover:border-white/20"
              }`}
            >
              Todos
            </button>
            {setores.map((s) => (
              <button
                key={s}
                onClick={() => setSetor(s)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                  setor === s
                    ? "bg-brand text-white"
                    : "border border-white/10 text-slate-400 hover:border-white/20"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Grade de mesas */}
      <div className="p-4">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            <AnimatePresence>
              {mesasFiltradas.map((mesa) => {
                const cfg = STATUS_CONFIG[mesa.status];
                return (
                  <motion.button
                    key={mesa.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={() => {
                      window.location.href = `/garcom/mesa/${mesa.id}`;
                    }}
                    className={`relative flex flex-col items-center justify-center rounded-2xl border p-4 text-center transition hover:scale-105 ${cfg.bg} ${cfg.border}`}
                  >
                    <span className="text-2xl font-black text-white">
                      {mesa.numero}
                    </span>
                    {mesa.nome && (
                      <span className="mt-0.5 text-[10px] text-slate-400">{mesa.nome}</span>
                    )}
                    <span className={`mt-1 text-[10px] font-medium ${cfg.text}`}>
                      {cfg.label}
                    </span>

                    {mesa.status === "ocupada" && mesa.pedido_total && (
                      <span className="mt-1 text-[10px] font-semibold text-white">
                        {mesa.pedido_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    )}

                    {mesa.tempo_aberta_segundos && mesa.status === "ocupada" && (
                      <span className="mt-0.5 text-[9px] text-slate-400">
                        {formatTempo(mesa.tempo_aberta_segundos)}
                      </span>
                    )}

                    {mesa.capacidade && (
                      <div className="absolute right-2 top-2 flex items-center gap-0.5">
                        <Users className="h-2.5 w-2.5 text-slate-500" />
                        <span className="text-[9px] text-slate-500">{mesa.capacidade}</span>
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {mesasFiltradas.length === 0 && !loading && (
          <div className="flex flex-col items-center py-16 text-slate-500">
            <MapPin className="mb-2 h-10 w-10" />
            <p className="text-sm">Nenhuma mesa cadastrada</p>
          </div>
        )}
      </div>

      {/* FAB — Novo pedido avulso */}
      <button
        onClick={() => (window.location.href = "/garcom/pedido/novo")}
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand shadow-lg shadow-brand/30 transition hover:brightness-110 active:scale-95"
      >
        <Plus className="h-6 w-6 text-white" />
      </button>
    </div>
  );
}
