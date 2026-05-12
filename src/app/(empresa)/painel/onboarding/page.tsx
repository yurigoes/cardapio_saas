"use client";

/**
 * /painel/onboarding — wizard guiado para empresas novas
 *
 * Mostra os 5 passos de configuração inicial. Cada passo:
 *   - check verde se já completo
 *   - botão "Configurar" leva à página correspondente
 *   - usuário pode pular e voltar depois (banner persiste no /painel)
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight, Sparkles, RefreshCw } from "lucide-react";

interface Step {
  id:    string;
  label: string;
  done:  boolean;
  hint:  string;
  href:  string;
}
interface Status {
  total:     number;
  completos: number;
  pendentes: number;
  completo:  boolean;
  steps:     Step[];
}

export default function OnboardingPage() {
  const [data, setData]       = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const res   = await fetch("/api/painel/onboarding/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (j.success) setData(j.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const pct = data ? Math.round((data.completos / data.total) * 100) : 0;

  return (
    <div className="space-y-6 pb-12 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Sparkles className="h-5 w-5 text-brand" />
            Bem-vindo! Vamos configurar seu cardápio
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Complete os 5 passos para começar a vender online.
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Verificar
        </button>
      </div>

      {/* Progresso */}
      {data && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">
              {data.completos} de {data.total} concluídos
            </span>
            <span className="text-sm font-bold text-brand">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-brand transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {data.completo && (
            <p className="mt-3 text-sm text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Tudo pronto! Seu cardápio está operacional.
            </p>
          )}
        </div>
      )}

      {/* Steps */}
      {data && (
        <div className="space-y-3">
          {data.steps.map((step, i) => (
            <div
              key={step.id}
              className={`rounded-2xl border p-4 flex items-start gap-4 transition ${
                step.done
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {step.done ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                ) : (
                  <Circle className="h-6 w-6 text-slate-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500">{i + 1}.</span>
                  <h3 className={`text-sm font-semibold ${step.done ? "text-emerald-300" : "text-white"}`}>
                    {step.label}
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{step.hint}</p>
              </div>
              {!step.done && (
                <Link
                  href={step.href}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 transition flex-shrink-0"
                >
                  Configurar
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {step.done && (
                <Link
                  href={step.href}
                  className="text-xs text-slate-500 hover:text-white flex-shrink-0"
                >
                  Editar
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {loading && !data && (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      )}

      {/* Voltar */}
      <div className="pt-4">
        <Link
          href="/painel"
          className="text-xs text-slate-500 hover:text-white"
        >
          ← Voltar ao dashboard
        </Link>
      </div>
    </div>
  );
}
