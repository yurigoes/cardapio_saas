"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChefHat, Clock, RefreshCw, LogOut,
  CheckCircle, Flame, AlertCircle, UtensilsCrossed,
} from "lucide-react";

/* ─── tipos ─────────────────────────────────── */
interface PedidoItem {
  id: string;
  nome: string;
  quantidade: number;
  observacoes: string | null;
}

interface Pedido {
  id: string;
  numero: number;
  tipo: "mesa" | "balcao" | "delivery" | "totem";
  status: "pendente" | "em_preparo" | "pronto";
  mesa_numero: number | null;
  cliente_nome: string | null;
  observacoes: string | null;
  created_at: string;
  tempo_segundos: number;
  itens: PedidoItem[];
}

/* ─── helpers ────────────────────────────────── */
function formatTempo(s: number) {
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

function tempoColor(s: number) {
  if (s < 600)  return "text-emerald-400"; // < 10min
  if (s < 1200) return "text-yellow-400";  // < 20min
  return "text-red-400";                   // >= 20min
}

const TIPO_LABEL: Record<string, string> = {
  mesa:     "Mesa",
  balcao:   "Balcão",
  delivery: "Delivery",
  totem:    "Totem",
};

const TIPO_COR: Record<string, string> = {
  mesa:     "bg-blue-500/20 text-blue-300 border-blue-500/30",
  balcao:   "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  delivery: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  totem:    "bg-violet-500/20 text-violet-300 border-violet-500/30",
};

/* ─── coluna de status ────────────────────────── */
const COLUNAS = [
  {
    status: "pendente" as const,
    label:  "Novos pedidos",
    icon:   AlertCircle,
    cor:    "border-red-500/40",
    header: "bg-red-500/10",
    badge:  "bg-red-500 text-white",
    btn:    { label: "Iniciar preparo", next: "em_preparo" as const, cls: "bg-orange-500 hover:bg-orange-400" },
  },
  {
    status: "em_preparo" as const,
    label:  "Em preparo",
    icon:   Flame,
    cor:    "border-orange-500/40",
    header: "bg-orange-500/10",
    badge:  "bg-orange-500 text-white",
    btn:    { label: "Marcar pronto", next: "pronto" as const, cls: "bg-emerald-500 hover:bg-emerald-400" },
  },
  {
    status: "pronto" as const,
    label:  "Prontos",
    icon:   CheckCircle,
    cor:    "border-emerald-500/40",
    header: "bg-emerald-500/10",
    badge:  "bg-emerald-500 text-white",
    btn:    { label: "Entregar / Fechar", next: "entregue" as const, cls: "bg-slate-600 hover:bg-slate-500" },
  },
];

/* ─── card de pedido ──────────────────────────── */
function PedidoCard({
  pedido,
  btn,
  onAvancar,
}: {
  pedido: Pedido;
  btn: (typeof COLUNAS)[number]["btn"];
  onAvancar: (id: string, next: string) => Promise<void>;
}) {
  const [atualizando, setAtualizando] = useState(false);
  const [tempo, setTempo] = useState(pedido.tempo_segundos);

  // ticker local para mostrar tempo passando sem depender de re-fetch
  useEffect(() => {
    const t = setInterval(() => setTempo((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function handleClick() {
    setAtualizando(true);
    try { await onAvancar(pedido.id, btn.next); }
    finally { setAtualizando(false); }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
      {/* cabeçalho do card */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-800/60 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-white">#{pedido.numero}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${TIPO_COR[pedido.tipo] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}>
            {pedido.tipo === "mesa" && pedido.mesa_numero
              ? `Mesa ${pedido.mesa_numero}`
              : TIPO_LABEL[pedido.tipo] ?? pedido.tipo}
          </span>
          {pedido.cliente_nome && (
            <span className="text-xs text-slate-400 truncate max-w-[120px]">{pedido.cliente_nome}</span>
          )}
        </div>
        <span className={`flex items-center gap-1 text-xs font-mono font-semibold ${tempoColor(tempo)}`}>
          <Clock className="h-3 w-3" />
          {formatTempo(tempo)}
        </span>
      </div>

      {/* itens */}
      <div className="flex-1 px-4 py-3 space-y-2">
        {pedido.itens.map((item) => (
          <div key={item.id} className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-xs font-bold text-white">
              {item.quantidade}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white leading-snug">{item.nome}</p>
              {item.observacoes && (
                <p className="text-xs text-amber-400 mt-0.5">{item.observacoes}</p>
              )}
            </div>
          </div>
        ))}
        {pedido.observacoes && (
          <p className="text-xs text-slate-400 border-t border-white/5 pt-2 mt-2">
            {pedido.observacoes}
          </p>
        )}
      </div>

      {/* botão de ação */}
      <div className="px-4 pb-4">
        <button
          onClick={handleClick}
          disabled={atualizando}
          className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${btn.cls}`}
        >
          {atualizando ? "Atualizando..." : btn.label}
        </button>
      </div>
    </div>
  );
}

/* ─── página principal ───────────────────────── */
export default function CozinhaPage() {
  const router = useRouter();
  const [pedidos, setPedidos]   = useState<Pedido[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState<string>("todos");
  const [lastCount, setLast]    = useState(0);
  const audioCtx = useRef<AudioContext | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";

  function beep() {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch { /* sem suporte a áudio */ }
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const url = filtro !== "todos" ? `/api/cozinha?tipo=${filtro}` : "/api/cozinha";
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.success) { router.push("/login"); return; }

      const novos = (data.data as Pedido[]).filter((p) => p.status === "pendente").length;
      if (novos > lastCount && lastCount >= 0) beep();
      setLast(novos);
      setPedidos(data.data);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, filtro, lastCount, router]);

  // carga inicial
  useEffect(() => {
    if (!token) { router.push("/login"); return; }
    load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // re-fetch ao mudar filtro
  useEffect(() => { load(); }, [filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  // polling a cada 15s
  useEffect(() => {
    const t = setInterval(() => load(true), 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function avancar(id: string, next: string) {
    await fetch(`/api/pedidos/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ status: next }),
    });
    await load(true);
  }

  function handleLogout() {
    fetch("/api/auth/logout", {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    }).finally(() => { localStorage.clear(); router.push("/login"); });
  }

  const porStatus = (s: Pedido["status"]) => pedidos.filter((p) => p.status === s);
  const totalAtivos = pedidos.filter((p) => p.status !== "pronto").length;

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-white overflow-hidden">
      {/* ── top bar ── */}
      <header className="flex items-center gap-3 border-b border-white/5 bg-slate-900/80 backdrop-blur px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/20">
            <ChefHat className="h-4 w-4 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none">Cozinha — KDS</p>
            <p className="text-[11px] text-slate-500 leading-none mt-0.5">
              {totalAtivos > 0 ? `${totalAtivos} pedido${totalAtivos > 1 ? "s" : ""} em aberto` : "Sem pedidos no momento"}
            </p>
          </div>
        </div>

        {/* filtro de tipo */}
        <div className="flex gap-1.5 ml-4">
          {["todos", "mesa", "balcao", "delivery"].map((t) => (
            <button
              key={t}
              onClick={() => setFiltro(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filtro === t ? "bg-orange-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {t === "todos" ? "Todos" : TIPO_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => load()}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:text-white transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:border-red-500/30 hover:text-red-400 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </header>

      {/* ── colunas ── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-hidden p-4">
          {COLUNAS.map((col) => {
            const lista = porStatus(col.status);
            const Icon  = col.icon;
            return (
              <div key={col.status} className={`flex flex-1 flex-col rounded-2xl border ${col.cor} overflow-hidden min-w-0`}>
                {/* cabeçalho da coluna */}
                <div className={`flex items-center gap-2 px-4 py-3 ${col.header} border-b border-white/5 flex-shrink-0`}>
                  <Icon className="h-4 w-4 text-white/70" />
                  <span className="font-semibold text-sm text-white">{col.label}</span>
                  <span className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${col.badge}`}>
                    {lista.length}
                  </span>
                </div>

                {/* cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {lista.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-slate-600">
                      <UtensilsCrossed className="h-8 w-8" />
                      <p className="text-xs">Nenhum pedido</p>
                    </div>
                  ) : (
                    lista.map((pedido) => (
                      <PedidoCard
                        key={pedido.id}
                        pedido={pedido}
                        btn={col.btn}
                        onAvancar={avancar}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
