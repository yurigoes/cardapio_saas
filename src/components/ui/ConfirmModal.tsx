"use client";

/**
 * Modal de confirmação/alerta global.
 *
 * Substitui window.confirm() e window.alert() por modal estilizado.
 * Uso:
 *   import { confirmar, alertar } from "@/components/ui/ConfirmModal";
 *   if (await confirmar("Apagar tudo?")) { ... }
 *   await alertar("Salvo com sucesso!");
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Info, X, Loader2 } from "lucide-react";

interface ModalConfig {
  titulo:    string;
  mensagem?: string;
  tipo:      "info" | "sucesso" | "alerta" | "perigo" | "confirmacao";
  okLabel?:  string;
  cancelLabel?: string;
  resolve:   (v: boolean) => void;
}

let _emit: ((cfg: ModalConfig | null) => void) | null = null;

/** Mostra modal de confirmação. Resolve true se OK, false se cancelar. */
export function confirmar(opts: { titulo: string; mensagem?: string; okLabel?: string; cancelLabel?: string; perigo?: boolean }): Promise<boolean> {
  return new Promise(resolve => {
    if (!_emit) { resolve(window.confirm(`${opts.titulo}\n\n${opts.mensagem ?? ""}`)); return; }
    _emit({
      titulo:      opts.titulo,
      mensagem:    opts.mensagem,
      tipo:        opts.perigo ? "perigo" : "confirmacao",
      okLabel:     opts.okLabel ?? "Confirmar",
      cancelLabel: opts.cancelLabel ?? "Cancelar",
      resolve,
    });
  });
}

/** Mostra alerta. Resolve quando user clicar OK. */
export function alertar(opts: { titulo: string; mensagem?: string; tipo?: "info" | "sucesso" | "alerta" | "perigo" }): Promise<void> {
  return new Promise(resolve => {
    if (!_emit) { window.alert(`${opts.titulo}\n\n${opts.mensagem ?? ""}`); resolve(); return; }
    _emit({
      titulo:   opts.titulo,
      mensagem: opts.mensagem,
      tipo:     opts.tipo ?? "info",
      okLabel:  "OK",
      resolve:  () => resolve(),
    });
  });
}

const TIPO_STYLES = {
  info:         { icon: Info, cor: "text-blue-400 bg-blue-500/15",       border: "border-blue-500/30" },
  sucesso:      { icon: Check, cor: "text-emerald-400 bg-emerald-500/15", border: "border-emerald-500/30" },
  alerta:       { icon: AlertTriangle, cor: "text-amber-400 bg-amber-500/15", border: "border-amber-500/30" },
  perigo:       { icon: AlertTriangle, cor: "text-red-400 bg-red-500/15", border: "border-red-500/30" },
  confirmacao:  { icon: Info, cor: "text-blue-400 bg-blue-500/15",       border: "border-white/10" },
};

export function ConfirmModalRoot() {
  const [cfg, setCfg] = useState<ModalConfig | null>(null);

  useEffect(() => {
    _emit = setCfg;
    return () => { _emit = null; };
  }, []);

  if (!cfg) return null;

  const tipo = TIPO_STYLES[cfg.tipo];
  const Icon = tipo.icon;
  const isConfirm = cfg.tipo === "confirmacao" || cfg.tipo === "perigo";
  const okClass = cfg.tipo === "perigo"
    ? "bg-red-500 hover:bg-red-400"
    : cfg.tipo === "sucesso"
      ? "bg-emerald-500 hover:bg-emerald-400"
      : "bg-emerald-500 hover:bg-emerald-400";

  function close(ok: boolean) {
    cfg!.resolve(ok);
    setCfg(null);
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
         onClick={() => close(false)}>
      <div className={`w-full max-w-md rounded-2xl border ${tipo.border} bg-slate-900 shadow-2xl`}
           onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className={`rounded-xl p-2.5 flex-shrink-0 ${tipo.cor}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-white">{cfg.titulo}</h3>
            </div>
            <button onClick={() => close(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {cfg.mensagem && (
            <pre className="text-sm text-slate-300 whitespace-pre-wrap break-words mb-5 leading-relaxed font-sans">
              {cfg.mensagem}
            </pre>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            {isConfirm && (
              <button onClick={() => close(false)}
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-5 py-2.5 text-sm font-medium text-slate-300">
                {cfg.cancelLabel ?? "Cancelar"}
              </button>
            )}
            <button onClick={() => close(true)} autoFocus
              className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white ${okClass}`}>
              {cfg.okLabel ?? "OK"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
