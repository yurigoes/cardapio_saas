"use client";

/**
 * Sistema de notificações em modal (toast + confirm + prompt) com a marca.
 * Use:
 *   import { notify, confirmModal, promptModal, NotifyHost } from "@/components/Notify";
 *   notify("Salvo!", "success");
 *   if (await confirmModal("Excluir?")) { ... }
 *   const nome = await promptModal("Novo nome", "atual");
 * Monte <NotifyHost/> uma vez no topo de cada página.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type Tipo = "success" | "error" | "info";
interface Toast { id: number; msg: string; tipo: Tipo; }
interface Confirm { id: number; msg: string; tipo: "confirm" | "prompt"; valor?: string; resolve: (v: boolean | string | null) => void; }

type Listener = () => void;
let toasts: Toast[] = [];
let dialog: Confirm | null = null;
let seq = 1;
const listeners = new Set<Listener>();
function emit() { listeners.forEach(l => l()); }

export function notify(msg: string, tipo: Tipo = "info") {
  const id = seq++;
  toasts = [...toasts, { id, msg, tipo }];
  emit();
  setTimeout(() => { toasts = toasts.filter(t => t.id !== id); emit(); }, 4000);
}
export function confirmModal(msg: string): Promise<boolean> {
  return new Promise(resolve => { dialog = { id: seq++, msg, tipo: "confirm", resolve: v => resolve(Boolean(v)) }; emit(); });
}
export function promptModal(msg: string, valor = ""): Promise<string | null> {
  return new Promise(resolve => { dialog = { id: seq++, msg, tipo: "prompt", valor, resolve: v => resolve(typeof v === "string" ? v : null) }; emit(); });
}

export function NotifyHost() {
  const [, force] = useState(0);
  const [campo, setCampo] = useState("");
  useEffect(() => {
    const l = () => force(x => x + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  useEffect(() => { if (dialog?.tipo === "prompt") setCampo(dialog.valor ?? ""); }, [dialog?.id]);

  function fechaDialog(v: boolean | string | null) { const d = dialog; dialog = null; emit(); d?.resolve(v); }

  const cor: Record<Tipo, string> = {
    success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100",
    error: "border-red-500/40 bg-red-500/15 text-red-100",
    info: "border-brand/40 bg-brand/15 text-violet-100",
  };
  const Icon = { success: CheckCircle2, error: AlertTriangle, info: Info };

  return (
    <>
      {/* Toasts */}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map(t => {
          const I = Icon[t.tipo];
          return (
            <div key={t.id} className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${cor[t.tipo]}`}>
              <I className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{t.msg}</span>
              <button onClick={() => { toasts = toasts.filter(x => x.id !== t.id); emit(); }} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>

      {/* Confirm / Prompt */}
      {dialog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onClick={() => fechaDialog(dialog?.tipo === "confirm" ? false : null)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12121c] p-6 text-white">
            <p className="text-sm">{dialog.msg}</p>
            {dialog.tipo === "prompt" && (
              <input autoFocus value={campo} onChange={e => setCampo(e.target.value)} onKeyDown={e => { if (e.key === "Enter") fechaDialog(campo); }}
                className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => fechaDialog(dialog?.tipo === "confirm" ? false : null)} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Cancelar</button>
              <button onClick={() => fechaDialog(dialog?.tipo === "confirm" ? true : campo)} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
