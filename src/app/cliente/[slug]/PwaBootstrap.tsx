"use client";

/**
 * Componente cliente que:
 *   1. Registra o service worker (/sw.js)
 *   2. Captura o evento beforeinstallprompt (Android/Desktop)
 *   3. Detecta iOS Safari (precisa de instruções manuais)
 *   4. Mostra um banner discreto convidando para "Adicionar à tela inicial"
 *
 * Banner some quando o usuário fecha (persiste 7 dias em localStorage)
 * ou quando o app já está rodando como PWA (display: standalone).
 */
import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt:    () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = (slug: string) => `pwa_dismiss_${slug}`;
const DISMISS_DAYS = 7;

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    // Safari iOS legacy
    || (window.navigator as { standalone?: boolean }).standalone === true;
}

function dismissedRecently(slug: string): boolean {
  if (typeof localStorage === "undefined") return false;
  const stored = localStorage.getItem(DISMISS_KEY(slug));
  if (!stored) return false;
  const ageMs = Date.now() - parseInt(stored, 10);
  return ageMs < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export default function PwaBootstrap({ slug }: { slug: string }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner,   setShowBanner]   = useState(false);
  const [showIosHelp,  setShowIosHelp]  = useState(false);

  // ── Registra service worker ────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // evita conflitos em dev

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[PWA] Falha ao registrar SW:", err);
    });
  }, []);

  // ── Captura evento de instalação (Android/Chrome/Edge) ─────────────────────
  useEffect(() => {
    if (isStandalone() || dismissedRecently(slug)) return;

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      // Atrasa o banner alguns segundos para não atrapalhar primeira interação
      setTimeout(() => setShowBanner(true), 4000);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, [slug]);

  // ── iOS: sem evento, então mostra ajuda após 6s se não estiver standalone ──
  useEffect(() => {
    if (!isIos() || isStandalone() || dismissedRecently(slug)) return;
    const t = setTimeout(() => setShowBanner(true), 6000);
    return () => clearTimeout(t);
  }, [slug]);

  function handleInstall() {
    if (installEvent) {
      installEvent.prompt();
      installEvent.userChoice.then(() => {
        setInstallEvent(null);
        setShowBanner(false);
      });
    } else if (isIos()) {
      setShowIosHelp(true);
    }
  }

  function dismiss() {
    setShowBanner(false);
    setShowIosHelp(false);
    try { localStorage.setItem(DISMISS_KEY(slug), String(Date.now())); } catch {}
  }

  if (!showBanner && !showIosHelp) return null;

  // ── iOS instructions modal ─────────────────────────────────────────────────
  if (showIosHelp) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />
        <div className="relative w-full max-w-sm rounded-3xl bg-slate-900 border border-white/10 p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Adicionar à tela inicial</h3>
            <button onClick={dismiss} className="text-slate-400 hover:text-white transition">
              <X className="h-5 w-5" />
            </button>
          </div>
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-3">
              <span
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: "var(--color-primary, #10b981)" }}
              >1</span>
              <span>Toque no ícone <Share className="inline h-4 w-4 mx-1" /> <strong>Compartilhar</strong> na barra do Safari</span>
            </li>
            <li className="flex items-start gap-3">
              <span
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: "var(--color-primary, #10b981)" }}
              >2</span>
              <span>Role para baixo e toque em <strong>Adicionar à Tela Inicial</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: "var(--color-primary, #10b981)" }}
              >3</span>
              <span>Confirme em <strong>Adicionar</strong> — pronto!</span>
            </li>
          </ol>
          <button
            onClick={dismiss}
            className="mt-5 w-full rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition"
          >
            Entendi
          </button>
        </div>
      </div>
    );
  }

  // ── Banner discreto (Android/Desktop ou primeira impressão iOS) ────────────
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md">
      <div
        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px var(--color-primary-15, rgba(16,185,129,0.15))" }}
      >
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--color-primary-15, rgba(16,185,129,0.15))" }}
        >
          <Download className="h-5 w-5" style={{ color: "var(--color-primary, #10b981)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Instalar como app</p>
          <p className="text-xs text-slate-400">Acesso rápido aos seus pontos</p>
        </div>
        <button
          onClick={handleInstall}
          style={{ background: "var(--color-primary, #10b981)" }}
          className="rounded-xl px-3 py-2 text-xs font-bold text-white transition hover:brightness-110"
        >
          Instalar
        </button>
        <button
          onClick={dismiss}
          className="flex-shrink-0 text-slate-500 hover:text-white transition"
          aria-label="Dispensar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
