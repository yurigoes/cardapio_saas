"use client";

/**
 * PwaInstallPrompt — banner sutil quando o browser oferece instalação do PWA.
 *
 * - Captura evento `beforeinstallprompt` (Chrome/Edge/Android)
 * - Mostra banner com "Instalar app" no rodapé
 * - Usuário pode dispensar (esconde por 7 dias)
 * - Após aceitar, banner some
 */
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa_install_dismissed_at";
const DISMISS_DAYS = 7;

export function PwaInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Já dismiss recente?
    const dismAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dismAt && Date.now() - dismAt < DISMISS_DAYS * 86_400_000) {
      setDismissed(true);
      return;
    }

    function handler(e: Event) {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (dismissed || !evt) return null;

  async function instalar() {
    if (!evt) return;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === "accepted") {
      setEvt(null);
    } else {
      dispensar();
    }
  }

  function dispensar() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
    setEvt(null);
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900/95 backdrop-blur p-3 shadow-xl flex items-center gap-3 sm:left-auto sm:right-4">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
        <Download className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">Instalar painel como app</p>
        <p className="text-[11px] text-slate-400">
          Abre direto sem browser, ícone na área de trabalho
        </p>
      </div>
      <button
        onClick={instalar}
        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:brightness-110"
      >
        Instalar
      </button>
      <button
        onClick={dispensar}
        title="Não mostrar por 7 dias"
        className="text-slate-400 hover:text-white p-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
