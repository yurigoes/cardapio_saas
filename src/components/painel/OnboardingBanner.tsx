"use client";

/**
 * OnboardingBanner — banner persistente "Complete sua configuração (X/5)".
 *
 * Some quando completos === total. Some também se usuário deu dismiss
 * (localStorage flag) — mas só fica oculto naquele browser.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

interface Status {
  total:     number;
  completos: number;
  completo:  boolean;
}

const DISMISS_KEY = "onboarding_dismissed_at";

export function OnboardingBanner() {
  const [data, setData]       = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Dismiss vale por 24h (deixa visível de novo no dia seguinte)
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (at && Date.now() - at < 24 * 60 * 60 * 1000) {
      setDismissed(true);
      return;
    }

    const token = localStorage.getItem("access_token");
    if (!token) return;
    fetch("/api/painel/onboarding/status", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {});
  }, []);

  if (dismissed || !data || data.completo) return null;

  const pct = Math.round((data.completos / data.total) * 100);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  return (
    <div className="rounded-2xl border border-brand/30 bg-brand/10 p-4 flex items-start gap-3">
      <Sparkles className="h-5 w-5 text-brand flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">
          Complete sua configuração ({data.completos}/{data.total})
        </p>
        <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-brand transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <Link
        href="/painel/onboarding"
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 transition flex-shrink-0"
      >
        Continuar
      </Link>
      <button
        onClick={dismiss}
        title="Ocultar por 24h"
        className="text-slate-400 hover:text-white flex-shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
