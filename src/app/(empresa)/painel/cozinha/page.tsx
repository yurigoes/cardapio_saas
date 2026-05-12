"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  ChefHat, Clock, RefreshCw, Volume2, VolumeX, Bell, ExternalLink,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdicionalItem {
  grupo_id?:    string;
  grupo_nome?:  string;
  opcao_id?:    string;
  opcao_nome?:  string;
  preco_extra?: number;
}

interface PedidoItem {
  id:             string;
  nome:           string;
  quantidade:     number;
  preco_unitario: number;
  subtotal:       number;
  observacoes:    string | null;
  adicionais?:    AdicionalItem[] | null;
}

interface Pedido {
  id:           string;
  numero:       number;
  tipo:         string;
  status:       string;
  total:        number;
  created_at:   string;
  cliente_nome: string | null;
  mesa_numero:  number | null;
  comanda:      string | null;
  slug?:        string;
  itens:        PedidoItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

function elapsedMinutes(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

function timerColor(minutes: number): string {
  if (minutes < 10) return "text-brand";
  if (minutes < 20) return "text-yellow-400";
  return "text-red-400";
}

function timerBg(minutes: number): string {
  if (minutes < 10) return "bg-brand/10 border-brand/20";
  if (minutes < 20) return "bg-yellow-400/10 border-yellow-400/20";
  return "bg-red-400/10 border-red-400/20 animate-pulse";
}

function beep(ctx: AudioContext) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type            = "sine";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}

const TIPO_LABELS: Record<string, string> = {
  mesa:     "Mesa",
  balcao:   "Balcão",
  delivery: "Delivery",
  totem:    "Totem",
  whatsapp: "WhatsApp",
  app:      "App",
};

const NEXT_STATUS: Record<string, { label: string; status: string; color: string } | null> = {
  pendente:   { label: "Iniciar",  status: "confirmado", color: "bg-blue-500 hover:bg-blue-400 text-white" },
  confirmado: { label: "Preparar", status: "preparando", color: "bg-orange-500 hover:bg-orange-400 text-white" },
  preparando: { label: "Pronto",   status: "pronto",     color: "bg-brand hover:brightness-110 text-white" },
  pronto:     { label: "Entregar", status: "entregue",   color: "bg-purple-500 hover:bg-purple-400 text-white" },
  entregue:   null,
  cancelado:  null,
};

const COLUMN_STATUSES = ["pendente", "confirmado", "preparando", "pronto"] as const;

const COLUMN_CONFIG: Record<string, { label: string; accent: string; border: string }> = {
  pendente:   { label: "Pendente",   accent: "text-yellow-400",  border: "border-yellow-400/30"  },
  confirmado: { label: "Confirmado", accent: "text-blue-400",    border: "border-blue-400/30"    },
  preparando: { label: "Em Preparo", accent: "text-orange-400",  border: "border-orange-400/30"  },
  pronto:     { label: "Prontos 🔔", accent: "text-brand", border: "border-brand/30" },
};

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastState { type: "success" | "error"; msg: string }

function Toast({ toast }: { toast: ToastState }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur-sm ${
      toast.type === "success"
        ? "border-brand/30 bg-slate-900/95 text-brand"
        : "border-red-500/30 bg-slate-900/95 text-red-300"
    }`}>
      <Bell className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm font-medium">{toast.msg}</span>
    </div>
  );
}

// ─── Timer component ──────────────────────────────────────────────────────────

function ElapsedTimer({ created_at }: { created_at: string }) {
  const [mins, setMins] = useState(() => elapsedMinutes(created_at));
  useEffect(() => {
    const id = setInterval(() => setMins(elapsedMinutes(created_at)), 10_000);
    return () => clearInterval(id);
  }, [created_at]);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${timerColor(mins)} ${timerBg(mins)}`}>
      <Clock className="h-3 w-3" />{mins}min
    </span>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────

interface CardProps {
  pedido:    Pedido;
  onUpdate:  (id: string, status: string) => Promise<void>;
  onChamar:  (pedido: Pedido) => Promise<void>;
  updating:  string | null;
  chamando:  string | null;
}

function PedidoCard({ pedido, onUpdate, onChamar, updating, chamando }: CardProps) {
  const next    = NEXT_STATUS[pedido.status];
  const isBusy  = updating === pedido.id;
  const isCalling = chamando === pedido.id;
  const mins    = elapsedMinutes(pedido.created_at);

  return (
    <div className={`rounded-2xl border bg-slate-900 p-4 flex flex-col gap-3 transition ${
      mins >= 20 ? "border-red-400/40" : "border-white/5"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-lg font-bold leading-tight">#{pedido.numero}</p>
          <p className="text-xs text-slate-500">
            {TIPO_LABELS[pedido.tipo] ?? pedido.tipo}
            {pedido.mesa_numero ? ` · Mesa ${pedido.mesa_numero}` : ""}
            {pedido.comanda ? ` · Comanda ${pedido.comanda}` : ""}
          </p>
          {pedido.cliente_nome && (
            <p className="text-xs text-slate-400 mt-0.5">{pedido.cliente_nome}</p>
          )}
        </div>
        <ElapsedTimer created_at={pedido.created_at} />
      </div>

      {/* Itens */}
      <div className="space-y-2 border-t border-white/5 pt-3">
        {pedido.itens.length === 0 ? (
          <p className="text-xs text-slate-500 italic">Carregando itens...</p>
        ) : (
          pedido.itens.map((item) => {
            // Agrupa adicionais por grupo (ex: Tamanho, Adicionais)
            const adicionaisPorGrupo: Record<string, string[]> = {};
            (item.adicionais ?? []).forEach((ad) => {
              const key = ad.grupo_nome ?? "Opções";
              if (!adicionaisPorGrupo[key]) adicionaisPorGrupo[key] = [];
              if (ad.opcao_nome) adicionaisPorGrupo[key].push(ad.opcao_nome);
            });
            const grupos = Object.entries(adicionaisPorGrupo);
            return (
              <div key={item.id}>
                <p className="text-sm font-medium">
                  <span className="text-brand font-bold mr-1">{item.quantidade}×</span>
                  {item.nome}
                </p>
                {/* Variações em destaque (cada grupo numa linha) */}
                {grupos.length > 0 && (
                  <ul className="ml-5 mt-1 space-y-0.5">
                    {grupos.map(([grupo, opcoes]) => (
                      <li key={grupo} className="text-xs leading-tight">
                        <span className="text-slate-500">{grupo}:</span>{" "}
                        <span className="font-semibold text-amber-300">{opcoes.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {item.observacoes && (
                  <p className="ml-5 mt-1 text-xs italic text-orange-300">⚠ {item.observacoes}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {/* Chamar cliente — só quando pronto */}
        {pedido.status === "pronto" && (
          <button
            onClick={() => onChamar(pedido)}
            disabled={isCalling}
            title="Chamar cliente no painel TV"
            className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50"
          >
            {isCalling ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            ) : (
              <Bell className="h-3.5 w-3.5" />
            )}
            Chamar
          </button>
        )}

        {/* Próximo status */}
        {next && (
          <button
            onClick={() => onUpdate(pedido.id, next.status)}
            disabled={isBusy}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition disabled:opacity-50 ${next.color}`}
          >
            {isBusy ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Atualizando...
              </span>
            ) : (
              next.label
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CozinhaPage() {
  const [pedidos,   setPedidos]   = useState<Pedido[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [updating,  setUpdating]  = useState<string | null>(null);
  const [chamando,  setChamando]  = useState<string | null>(null);
  const [soundOn,   setSoundOn]   = useState(true);
  const [lastCount, setLastCount] = useState(0);
  const [slug,      setSlug]      = useState<string>("");
  const [toast,     setToast]     = useState<ToastState | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  // Get slug from /api/auth/me
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setSlug(data.data?.empresa?.slug || "");
      })
      .catch(() => {});
  }, []);

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }

  const fetchPedidos = useCallback(async (isPolling = false) => {
    try {
      const token    = getToken();
      const statuses = ["pendente", "confirmado", "preparando", "pronto"];

      const results = await Promise.all(
        statuses.map((s) =>
          fetch(`/api/pedidos?status=${s}&limit=50`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then((r) => r.json())
        )
      );

      const all: Pedido[] = results.flatMap((r) => (r.success ? (r.data as Pedido[]) : []));

      // Fetch items for each pedido (batch)
      const withItems = await Promise.all(
        all.map(async (p) => {
          const res  = await fetch(`/api/pedidos/${p.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          return data.success ? (data.data as Pedido) : { ...p, itens: [] };
        })
      );

      // Sort oldest first
      withItems.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Sound notification
      if (isPolling && soundOn) {
        const newPendentes = withItems.filter(
          (p) => p.status === "pendente" && !knownIdsRef.current.has(p.id)
        );
        if (newPendentes.length > 0) {
          try { beep(getAudioCtx()); } catch { /* ignore */ }
        }
      }

      knownIdsRef.current = new Set(withItems.map((p) => p.id));
      setPedidos(withItems);
      setLastCount(withItems.length);
    } catch (err) {
      console.error("[KDS] fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [soundOn]);

  useEffect(() => { fetchPedidos(false); }, [fetchPedidos]);
  useEffect(() => {
    const id = setInterval(() => fetchPedidos(true), 8_000);
    return () => clearInterval(id);
  }, [fetchPedidos]);

  async function handleUpdate(id: string, status: string) {
    setUpdating(id);
    try {
      const token = getToken();
      await fetch(`/api/pedidos/${id}/status`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status }),
      });
      await fetchPedidos(false);
    } catch (err) {
      console.error("[KDS] update error", err);
    } finally {
      setUpdating(null);
    }
  }

  async function handleChamar(pedido: Pedido) {
    setChamando(pedido.id);
    try {
      const token = getToken();
      const res   = await fetch(`/api/painel/pedidos/${pedido.id}/chamar`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ balcao: "Balcão 1" }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", `Pedido #${pedido.numero} chamado no painel TV!`);
        // Play beep
        try { beep(getAudioCtx()); } catch { /* ignore */ }
      } else {
        showToast("error", "Erro ao chamar cliente");
      }
    } catch {
      showToast("error", "Erro de conexão");
    } finally {
      setChamando(null);
    }
  }

  const byStatus = (s: string) => pedidos.filter((p) => p.status === s);
  const counts = {
    pendente:   byStatus("pendente").length,
    confirmado: byStatus("confirmado").length,
    preparando: byStatus("preparando").length,
    pronto:     byStatus("pronto").length,
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {toast && <Toast toast={toast} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ChefHat className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-2xl font-bold">Cozinha / KDS</h1>
            <p className="text-xs text-slate-500">
              {counts.pendente} pendente{counts.pendente !== 1 ? "s" : ""} ·{" "}
              {counts.confirmado} confirmado{counts.confirmado !== 1 ? "s" : ""} ·{" "}
              {counts.preparando} em preparo ·{" "}
              {counts.pronto} pronto{counts.pronto !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Link para painel TV */}
          {slug && (
            <a
              href={`/painel/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Painel TV
            </a>
          )}

          <button
            onClick={() => setSoundOn(!soundOn)}
            title={soundOn ? "Desligar som" : "Ligar som"}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
              soundOn
                ? "border-brand/30 bg-brand/10 text-brand"
                : "border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            Som
          </button>

          <button
            onClick={() => fetchPedidos(false)}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-4 gap-3">
        {COLUMN_STATUSES.map((s) => {
          const cfg = COLUMN_CONFIG[s];
          return (
            <div key={s} className={`rounded-xl border bg-slate-900 p-3 ${cfg.border}`}>
              <p className="text-xs text-slate-500">{cfg.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${cfg.accent}`}>{counts[s]}</p>
            </div>
          );
        })}
      </div>

      {/* KDS Columns */}
      {loading && pedidos.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4 flex-1 min-h-0 overflow-auto pb-2">
          {COLUMN_STATUSES.map((s) => {
            const cfg     = COLUMN_CONFIG[s];
            const colPeds = byStatus(s);
            return (
              <div key={s} className="flex flex-col gap-3">
                <div className={`flex items-center justify-between rounded-xl border px-3 py-2 ${cfg.border} bg-slate-900/60`}>
                  <span className={`text-xs font-bold uppercase tracking-wider ${cfg.accent}`}>
                    {cfg.label}
                  </span>
                  <span className={`text-xs font-bold tabular-nums ${cfg.accent}`}>
                    {colPeds.length}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {colPeds.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-slate-600 text-xs">
                      Nenhum pedido
                    </div>
                  ) : (
                    colPeds.map((p) => (
                      <PedidoCard
                        key={p.id}
                        pedido={p}
                        onUpdate={handleUpdate}
                        onChamar={handleChamar}
                        updating={updating}
                        chamando={chamando}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-slate-600">
        Atualização automática a cada 8s · {lastCount} pedido{lastCount !== 1 ? "s" : ""} ativo{lastCount !== 1 ? "s" : ""}
        {slug && (
          <> · <a href={`/painel/${slug}`} target="_blank" className="underline hover:text-slate-400">Abrir painel TV</a></>
        )}
      </p>
    </div>
  );
}
