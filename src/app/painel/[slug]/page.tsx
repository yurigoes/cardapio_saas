"use client";

/**
 * /painel/[slug] — Painel de chamada de clientes (TV Mode)
 *
 * Exibir em televisão ou monitor posicionado na retirada.
 * A cozinha clica "Chamar cliente" no KDS → aparece aqui em tempo real.
 *
 * Funciona por polling a cada 4s (sem WebSocket extra).
 * Compatível com fullscreen do browser (F11).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { ChefHat, Bell, CheckCircle, Clock } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Chamado {
  id:           string;
  numero:       number;
  cliente_nome: string | null;
  balcao:       string | null;
  status:       string;
  chamado_em:   string;
}

interface EmpresaInfo {
  nome_fantasia: string;
  logo_url:      string | null;
  cor_primaria:  string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseTimestamp(ts: string): Date {
  // Converte "2024-01-15 14:30:00" ou ISO string → Date
  if (!ts) return new Date(0);
  return new Date(ts.replace(" ", "T") + (ts.includes("T") ? "" : "Z"));
}

function horaFormatada(ts: string): string {
  try {
    const d = parseTimestamp(ts);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Beep sintético via Web Audio API
function beep(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";

    // Sequência: beep-beep-beep
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      osc.frequency.setValueAtTime(880, now + i * 0.25);
      gain.gain.setValueAtTime(0.4, now + i * 0.25);
      gain.gain.setValueAtTime(0,   now + i * 0.25 + 0.18);
    }
    osc.start(now);
    osc.stop(now + 0.9);
  } catch { /* silent */ }
}

// Síntese de voz
function falarNumero(numero: number, nome: string | null) {
  if (!("speechSynthesis" in window)) return;
  const texto = nome
    ? `Pedido ${numero}, ${nome}, por favor, dirija-se ao balcão.`
    : `Pedido número ${numero}, por favor, dirija-se ao balcão.`;
  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang = "pt-BR";
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PainelTVPage({ params }: { params: { slug: string } }) {
  const [empresa,   setEmpresa]   = useState<EmpresaInfo | null>(null);
  const [chamados,  setChamados]  = useState<Chamado[]>([]);
  const [destaque,  setDestaque]  = useState<Chamado | null>(null);
  const [highlight, setHighlight] = useState(false);
  const [agora,     setAgora]     = useState("");
  const [voz,       setVoz]       = useState(true);
  const [notFound,  setNotFound]  = useState(false);

  const seenIds    = useRef<Set<string>>(new Set());
  const audioCtx   = useRef<AudioContext | null>(null);
  const primaryRef = useRef<string>("#10b981");

  // Relógio
  useEffect(() => {
    function tick() {
      setAgora(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit", minute: "2-digit", second: "2-digit",
          timeZone: "America/Sao_Paulo",
        })
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Carrega empresa (nome, logo, cor)
  useEffect(() => {
    fetch(`/api/pub/cardapio/${params.slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) { setNotFound(true); return; }
        const e = data.data.empresa as EmpresaInfo;
        setEmpresa(e);
        if (e.cor_primaria) primaryRef.current = e.cor_primaria;
        // Apply primary color
        document.documentElement.style.setProperty("--color-primary", e.cor_primaria || "#10b981");
      })
      .catch(() => setNotFound(true));
  }, [params.slug]);

  // AudioContext (lazy init on first interaction)
  useEffect(() => {
    function init() {
      if (!audioCtx.current) {
        audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    }
    window.addEventListener("click", init, { once: true });
    window.addEventListener("touchstart", init, { once: true });
    return () => {
      window.removeEventListener("click", init);
      window.removeEventListener("touchstart", init);
    };
  }, []);

  // Polling de chamados
  const fetchChamados = useCallback(async () => {
    try {
      const res  = await fetch(`/api/pub/painel/${params.slug}`);
      const data = await res.json();
      if (!data.success) return;

      const novos: Chamado[] = data.data.chamados ?? [];
      setChamados(novos);

      // Detecta novos
      for (const c of novos) {
        if (!seenIds.current.has(c.id)) {
          seenIds.current.add(c.id);
          if (seenIds.current.size > 1) {
            // É de fato novo (não primeira carga)
            setDestaque(c);
            setHighlight(true);
            beep(audioCtx.current);
            if (voz) falarNumero(c.numero, c.cliente_nome);
            setTimeout(() => setHighlight(false), 8000);
          }
        }
      }

      // Destaque padrão = mais recente
      if (novos.length > 0 && !destaque) {
        setDestaque(novos[0]);
      }
    } catch { /* silent */ }
  }, [params.slug, destaque, voz]);

  useEffect(() => {
    fetchChamados();
    const id = setInterval(fetchChamados, 4000);
    return () => clearInterval(id);
  }, [fetchChamados]);

  // ── CSS vars para cores dinâmicas ─────────────────────────────────────────
  const primary = primaryRef.current;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <ChefHat className="mx-auto h-16 w-16 text-slate-600" />
          <p className="mt-4 text-xl font-bold">Painel não encontrado</p>
        </div>
      </div>
    );
  }

  const fila = chamados.slice(0, 12);

  return (
    <div
      className="flex min-h-screen flex-col overflow-hidden bg-slate-950 text-white select-none"
      style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
    >

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-8 py-4 border-b border-white/5"
        style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.6) 0%, rgba(15,23,42,0.9) 100%)" }}
      >
        <div className="flex items-center gap-4">
          {empresa?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={empresa.logo_url}
              alt={empresa.nome_fantasia ?? ""}
              className="h-14 w-auto max-w-[220px] object-contain"
            />
          ) : (
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: `${primary}33` }}
            >
              <ChefHat className="h-6 w-6" style={{ color: primary }} />
            </div>
          )}
          <div>
            <p className="text-xl font-black tracking-wide text-white">
              {empresa?.nome_fantasia ?? "Cardápio"}
            </p>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
              Painel de Atendimento
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Voz toggle */}
          <button
            onClick={() => setVoz((v) => !v)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border transition ${
              voz
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-white/10 bg-white/5 text-white/40"
            }`}
          >
            🔊 {voz ? "Voz ativa" : "Voz desligada"}
          </button>

          {/* Relógio */}
          <div className="text-right">
            <p className="text-2xl font-mono font-bold text-white">{agora}</p>
            <p className="text-xs text-white/30">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
        </div>
      </header>

      {/* ── Corpo principal ───────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-0">

        {/* ESQUERDA: destaque principal */}
        <div className="flex flex-1 flex-col items-center justify-center p-12">
          {destaque ? (
            <div
              className={`flex flex-col items-center gap-6 rounded-3xl p-12 border-2 transition-all duration-700 ${
                highlight ? "scale-105" : "scale-100"
              }`}
              style={{
                borderColor: highlight ? primary : `${primary}40`,
                background:  highlight
                  ? `linear-gradient(135deg, ${primary}22, ${primary}08)`
                  : "rgba(255,255,255,0.02)",
                boxShadow: highlight
                  ? `0 0 80px ${primary}40, 0 0 30px ${primary}20`
                  : "none",
              }}
            >
              <div className="flex items-center gap-3">
                <Bell
                  className="h-10 w-10 animate-bounce"
                  style={{ color: primary }}
                />
                <span
                  className="text-lg font-bold uppercase tracking-widest"
                  style={{ color: primary }}
                >
                  {highlight ? "Novo chamado!" : "Pedido pronto"}
                </span>
              </div>

              {/* Número em destaque */}
              <div
                className="text-center"
                style={{
                  fontSize: "clamp(6rem, 20vw, 14rem)",
                  fontWeight: 900,
                  lineHeight: 1,
                  color: highlight ? primary : "white",
                  textShadow: highlight
                    ? `0 0 60px ${primary}60`
                    : "0 4px 24px rgba(0,0,0,0.5)",
                  transition: "all 0.5s",
                }}
              >
                {String(destaque.numero).padStart(3, "0")}
              </div>

              {destaque.cliente_nome && (
                <p className="text-2xl font-semibold text-white/80 text-center max-w-sm">
                  {destaque.cliente_nome}
                </p>
              )}

              <div
                className="flex items-center gap-2 rounded-full px-6 py-3 text-lg font-bold"
                style={{ background: `${primary}22`, color: primary }}
              >
                📍 {destaque.balcao ?? "Balcão 1"}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6 opacity-30">
              <CheckCircle className="h-24 w-24" style={{ color: primary }} />
              <p className="text-2xl font-semibold text-white">Aguardando pedidos...</p>
            </div>
          )}
        </div>

        {/* DIREITA: fila de chamados recentes */}
        <div
          className="w-80 flex-shrink-0 overflow-hidden border-l border-white/5"
          style={{ background: "rgba(0,0,0,0.3)" }}
        >
          <div className="border-b border-white/5 px-6 py-4">
            <p className="text-sm font-bold uppercase tracking-widest text-white/40">
              Chamados recentes
            </p>
          </div>

          <div className="overflow-y-auto h-full pb-8">
            {fila.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 pt-16 opacity-30">
                <Clock className="h-10 w-10 text-white/40" />
                <p className="text-sm text-white/40">Nenhum chamado</p>
              </div>
            ) : (
              fila.map((c, idx) => (
                <div
                  key={c.id}
                  onClick={() => { setDestaque(c); setHighlight(false); }}
                  className="flex cursor-pointer items-center gap-4 border-b border-white/5 px-6 py-4 transition hover:bg-white/5"
                  style={idx === 0 ? { borderLeft: `3px solid ${primary}` } : {}}
                >
                  <div
                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-lg font-black"
                    style={{
                      background: idx === 0 ? `${primary}25` : "rgba(255,255,255,0.05)",
                      color:      idx === 0 ? primary : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {String(c.numero).padStart(3, "0")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {c.cliente_nome ?? `Pedido #${c.numero}`}
                    </p>
                    <p className="text-xs text-white/30">
                      {c.balcao ?? "Balcão 1"} · {horaFormatada(c.chamado_em)}
                    </p>
                  </div>
                  {c.status === "atendido" && (
                    <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Rodapé ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 px-8 py-3 text-center">
        <p className="text-xs text-white/20 uppercase tracking-widest">
          {empresa?.nome_fantasia} · Painel de Atendimento · Pressione F11 para tela cheia
        </p>
      </footer>
    </div>
  );
}
