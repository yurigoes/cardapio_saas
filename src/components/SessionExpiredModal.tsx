"use client";

/**
 * Modal global de sessão expirada.
 *
 * Hooka window.fetch e detecta 401 em /api/*. Quando aparece,
 * mostra modal de relogin SEM perder a página atual. Após login OK,
 * recarrega a página atual (mantém URL, query, scroll position).
 *
 * Wrappear no layout principal — basta importar 1 vez.
 */
import { useEffect, useState } from "react";
import { Lock, Loader2, AlertTriangle, X } from "lucide-react";

let installed = false; // Evita instalar 2x se layout re-renderizar

export function SessionExpiredModal() {
  const [open, setOpen]   = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy]   = useState(false);
  const [erro, setErro]   = useState<string | null>(null);

  useEffect(() => {
    if (installed) return;
    installed = true;

    const orig = window.fetch.bind(window);

    function emit() {
      // Pega email atual do JWT pra prefill
      try {
        const t = localStorage.getItem("access_token");
        if (t) {
          const payload = JSON.parse(atob(t.split(".")[1]));
          if (payload?.email) {
            const ev = new CustomEvent("session-expired", { detail: { email: payload.email } });
            window.dispatchEvent(ev);
          }
        }
      } catch {}
      window.dispatchEvent(new CustomEvent("session-expired"));
    }

    window.fetch = async (...args) => {
      const r = await orig(...args);
      try {
        const url = typeof args[0] === "string" ? args[0]
                  : args[0] instanceof URL ? args[0].toString()
                  : args[0]?.url ?? "";
        // Só pega 401 em /api/*, ignora /api/auth/login (esse é login)
        if (r.status === 401 && url.includes("/api/") && !url.includes("/api/auth/login")) {
          emit();
        }
      } catch {}
      return r;
    };

    function onExpired(e: Event) {
      const detail = (e as CustomEvent).detail as { email?: string } | undefined;
      if (detail?.email) setEmail(detail.email);
      setOpen(true);
    }
    window.addEventListener("session-expired", onExpired);
    return () => window.removeEventListener("session-expired", onExpired);
  }, []);

  async function relogar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErro(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const d = await r.json();
      if (d.success) {
        localStorage.setItem("access_token",  d.data.access_token);
        localStorage.setItem("refresh_token", d.data.refresh_token);
        setOpen(false);
        setSenha("");
        // Recarrega só os dados — sem perder URL
        window.location.reload();
      } else {
        setErro(d.error?.message ?? d.error ?? "Falha");
      }
    } catch (err) {
      setErro((err as Error).message);
    } finally { setBusy(false); }
  }

  function deslogar() {
    localStorage.clear();
    window.location.href = "/login";
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-900 shadow-2xl">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-xl bg-amber-500/15 p-2.5">
              <Lock className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white">Sessão expirada</h3>
              <p className="text-xs text-slate-400">Entre novamente sem perder a tela atual.</p>
            </div>
          </div>

          {erro && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <form onSubmit={relogar} className="space-y-3">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="E-mail" autoComplete="email"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white" />
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
              required placeholder="Senha" autoComplete="current-password" autoFocus
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white" />
            <button type="submit" disabled={busy}
              className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 px-4 py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              {busy ? "Entrando..." : "Continuar"}
            </button>
            <button type="button" onClick={deslogar}
              className="w-full text-xs text-slate-400 hover:text-slate-300">
              Sair completamente
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
