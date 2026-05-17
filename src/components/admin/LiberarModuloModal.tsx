"use client";

/**
 * Modal pra liberar um módulo fora do plano.
 * Master clica num módulo bloqueado → escolhe experimental/à la carte/gratuito → confirma.
 *
 * Usado em:
 *   - /admin/empresas/[id]/editar (aba Plano)
 *   - /admin/empresas/[id]/modulos-extras (botão "Liberar")
 *
 * Props:
 *   - empresaId, modulo: contexto
 *   - precoSugerido?: vem do catálogo planos.modulos_alacarte (se cadastrado)
 *   - onClose, onSuccess: callbacks
 */
import { useState, useEffect } from "react";
import { X, Clock, DollarSign, Gift, Loader2 } from "lucide-react";
import { alertar } from "@/components/ui/ConfirmModal";

interface Props {
  empresaId: string;
  modulo:    string;
  precoSugerido?: number;
  onClose:   () => void;
  onSuccess: () => void;
}

export function LiberarModuloModal({ empresaId, modulo, precoSugerido, onClose, onSuccess }: Props) {
  const [tipo, setTipo] = useState<"experimental" | "alacarte" | "gratuito">("experimental");
  const [dias, setDias] = useState(7);
  const [preco, setPreco] = useState(precoSugerido ?? 0);
  const [observacao, setObservacao] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (precoSugerido !== undefined) setPreco(precoSugerido);
  }, [precoSugerido]);

  async function confirmar() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { modulo, tipo, observacao: observacao || undefined };
      if (tipo === "experimental") payload.dias = dias;
      if (tipo === "alacarte")     payload.preco = preco;

      const r = await fetch(`/api/admin/empresas/${empresaId}/modulos-extras`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha");
      onSuccess();
      onClose();
    } catch (e) {
      await alertar({ titulo: "Falha", mensagem: (e as Error).message, tipo: "perigo" });
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
         onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="text-base font-bold text-white">
            Liberar módulo <span className="font-mono text-emerald-400">{modulo}</span>
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-400">
            Como você quer liberar esse módulo?
          </p>

          <div className="space-y-2">
            <Opcao
              ativo={tipo === "experimental"}
              onClick={() => setTipo("experimental")}
              icon={Clock} cor="blue"
              titulo="Experimental"
              desc="Cliente testa por X dias e perde acesso automaticamente"
            />
            <Opcao
              ativo={tipo === "alacarte"}
              onClick={() => setTipo("alacarte")}
              icon={DollarSign} cor="amber"
              titulo="À la carte"
              desc="Cobrança recorrente — bloqueia em 24h se não pagar"
            />
            <Opcao
              ativo={tipo === "gratuito"}
              onClick={() => setTipo("gratuito")}
              icon={Gift} cor="emerald"
              titulo="Gratuito (cortesia)"
              desc="Sem expiração, ativo até você revogar"
            />
          </div>

          {tipo === "experimental" && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Dias de teste
              </label>
              <input type="number" value={dias} min={1} max={365}
                onChange={e => setDias(Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
              <p className="mt-1 text-[11px] text-slate-500">
                Vence em {new Date(Date.now() + dias*86400000).toLocaleDateString("pt-BR")}
              </p>
            </div>
          )}

          {tipo === "alacarte" && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Preço mensal (R$)
              </label>
              <input type="number" step="0.01" value={preco}
                onChange={e => setPreco(Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
              {precoSugerido !== undefined && precoSugerido > 0 && (
                <p className="mt-1 text-[11px] text-emerald-400">
                  💡 Preço sugerido do catálogo: R$ {precoSugerido.toFixed(2)}
                </p>
              )}
              <p className="mt-1 text-[11px] text-amber-400">
                ⚠ Bloqueia em 24h se não pagar
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Observação (opcional)
            </label>
            <input value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Ex: liberado por solicitação da gerência"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-600" />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose}
              className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">
              Cancelar
            </button>
            <button onClick={confirmar} disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Liberar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Opcao({ ativo, onClick, icon: Icon, cor, titulo, desc }: {
  ativo: boolean; onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  cor: "blue" | "amber" | "emerald";
  titulo: string; desc: string;
}) {
  const cores = {
    blue:    "border-blue-500/40 bg-blue-500/10 text-blue-200",
    amber:   "border-amber-500/40 bg-amber-500/10 text-amber-200",
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  };
  return (
    <button onClick={onClick}
      className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition ${
        ativo ? cores[cor] : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
      }`}>
      <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${ativo ? "" : "opacity-60"}`} />
      <div className="min-w-0">
        <p className="text-sm font-bold">{titulo}</p>
        <p className={`text-xs ${ativo ? "opacity-90" : "opacity-60"}`}>{desc}</p>
      </div>
    </button>
  );
}
