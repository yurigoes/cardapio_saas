"use client";

/**
 * TrialBanner — banner persistente no topo do /painel.
 *
 * Lê /api/painel/trial e mostra:
 *   - dias restantes (verde > 7, âmbar 3-7, vermelho < 3)
 *   - banner crítico se expirado (status='suspensa')
 *   - nada se status='ativo' (assinante pagante)
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Clock, CreditCard } from "lucide-react";
import Link from "next/link";

interface TrialInfo {
  status:        "teste" | "ativo" | "suspensa" | "cancelada";
  trial_fim:     string | null;
  ativo:         boolean;
  expirado:      boolean;
  diasRestantes: number;
}

export function TrialBanner() {
  const [info, setInfo] = useState<TrialInfo | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    fetch("/api/painel/trial", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setInfo(d.data); })
      .catch(() => {});
  }, []);

  if (!info) return null;
  if (info.status === "ativo") return null;            // assinante: nada a mostrar
  if (info.status === "cancelada") return null;        // empresa cancelada nem entra

  // Suspensa (trial expirou OU bloqueio manual)
  if (info.status === "suspensa") {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-bold text-red-300">Conta suspensa</p>
          <p className="mt-0.5 text-xs text-red-200/80">
            Seu período de teste acabou. Os módulos pagos estão bloqueados.
            Entre em contato para reativar.
          </p>
        </div>
        <a
          href="https://wa.me/5500000000000?text=Quero%20reativar%20minha%20conta"
          target="_blank" rel="noopener noreferrer"
          className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 transition flex items-center gap-1.5"
        >
          <CreditCard className="h-3.5 w-3.5" />
          Reativar
        </a>
      </div>
    );
  }

  // Trial ativo
  const dias = info.diasRestantes;
  const cor =
    dias > 7 ? { border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-300", icon: "text-emerald-400" }
    : dias > 3 ? { border: "border-amber-500/30",   bg: "bg-amber-500/10",   text: "text-amber-300",   icon: "text-amber-400" }
    :            { border: "border-red-500/30",     bg: "bg-red-500/10",     text: "text-red-300",     icon: "text-red-400"   };

  return (
    <div className={`rounded-2xl border ${cor.border} ${cor.bg} p-4 flex items-start gap-3`}>
      <Clock className={`h-5 w-5 ${cor.icon} flex-shrink-0 mt-0.5`} />
      <div className="flex-1">
        <p className={`text-sm font-bold ${cor.text}`}>
          {dias === 0 ? "Trial expira hoje" :
           dias === 1 ? "Trial expira amanhã" :
           `Trial expira em ${dias} dias`}
        </p>
        <p className="mt-0.5 text-xs text-slate-300/80">
          Aproveite para configurar tudo. Após o teste, módulos pagos ficam bloqueados.
        </p>
      </div>
      <Link
        href="/painel/config"
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 transition"
      >
        Assinar
      </Link>
    </div>
  );
}
