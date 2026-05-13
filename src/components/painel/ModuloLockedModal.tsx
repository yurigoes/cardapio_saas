"use client";

/**
 * Modal exibido quando o usuário tenta acessar um módulo não incluso.
 * Oferece trial 7 dias (1x por módulo) ou compra à la carte.
 */
import { useState } from "react";
import { Lock, Sparkles, ShoppingCart, X, Check, Calendar } from "lucide-react";
import type { ModuloStatus } from "@/lib/hooks/useModulos";

interface Props {
  modulo:  ModuloStatus | undefined | null;
  onClose: () => void;
  onSucesso?: () => void;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { dateStyle: "long" }) : "—";

export function ModuloLockedModal({ modulo, onClose, onSucesso }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg,  setMsg]  = useState<{ ok: boolean; texto: string } | null>(null);

  if (!modulo) return null;

  async function ativarTrial() {
    if (!modulo) return;
    setBusy("trial");
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch(`/api/painel/modulos/${modulo.key}/trial`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      });
      const d = await r.json();
      if (d.success) {
        setMsg({ ok: true, texto: `✓ Trial ativado até ${fmtData(d.data.expira_em)}!` });
        onSucesso?.();
        setTimeout(() => { onClose(); }, 2000);
      } else {
        setMsg({ ok: false, texto: d.error?.message ?? d.error ?? "Falha" });
      }
    } finally { setBusy(null); }
  }

  async function comprar() {
    if (!modulo) return;
    setBusy("compra");
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch(`/api/painel/modulos/${modulo.key}/comprar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      });
      const d = await r.json();
      if (d.success) {
        if (d.data.checkout_url) {
          // Redireciona pro Mercado Pago
          window.location.href = d.data.checkout_url;
        } else {
          setMsg({ ok: true, texto: `✓ ${d.data.mensagem ?? "Compra registrada (pendente)."}` });
        }
      } else {
        setMsg({ ok: false, texto: d.error?.message ?? d.error ?? "Falha" });
      }
    } finally { setBusy(null); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-500/15 p-2.5">
              <Lock className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{modulo.nome}</h3>
              <p className="text-xs text-slate-400">Não incluso no plano atual</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {msg && (
          <div className={`mx-6 mb-3 rounded-lg p-3 text-sm ${
            msg.ok ? "bg-emerald-500/10 text-emerald-200 border border-emerald-500/30"
                   : "bg-red-500/10 text-red-200 border border-red-500/30"
          }`}>
            {msg.texto}
          </div>
        )}

        <div className="px-6 pb-6 space-y-3">
          {modulo.pode_testar && (
            <button
              onClick={ativarTrial}
              disabled={busy !== null}
              className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 p-4 text-left transition disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-white">
                    Testar grátis por 7 dias
                  </p>
                  <p className="text-xs text-emerald-200">
                    Ative agora e use sem compromisso
                  </p>
                </div>
                {busy === "trial" && <span className="text-xs text-emerald-300">...</span>}
              </div>
            </button>
          )}

          {!modulo.pode_testar && !modulo.ativo && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-xs text-slate-400">
              <Calendar className="inline h-3.5 w-3.5 mr-1" />
              Trial deste módulo já foi utilizado.
            </div>
          )}

          {modulo.pode_comprar && (
            <button
              onClick={comprar}
              disabled={busy !== null}
              className="w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-4 text-left transition disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-blue-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-white">
                    Comprar à la carte
                  </p>
                  <p className="text-xs text-slate-300">
                    {fmtBRL(modulo.preco)} <span className="text-slate-500">/ mês</span>
                  </p>
                </div>
                {busy === "compra" && <span className="text-xs text-slate-300">...</span>}
              </div>
            </button>
          )}

          {modulo.ativo && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <Check className="inline h-4 w-4 mr-1" />
              Módulo já ativo.
              {modulo.trial_ativo && (
                <span className="block text-xs text-emerald-300/70 mt-1">
                  Trial até {fmtData(modulo.trial_ativo)}
                </span>
              )}
              {modulo.comprado_ate && (
                <span className="block text-xs text-emerald-300/70 mt-1">
                  Comprado até {fmtData(modulo.comprado_ate)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
