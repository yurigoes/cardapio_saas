"use client";

/**
 * ErrorReporter — captura erros não-tratados do client e envia para
 * /api/observability/error.
 *
 * Captura:
 *   - window.onerror (script errors síncronos)
 *   - window.onunhandledrejection (Promises rejeitadas)
 *
 * Throttle: 5 erros/minuto por sessão pra evitar storm.
 */
import { useEffect, useRef } from "react";

export function ErrorReporter() {
  const ultimosRef = useRef<number[]>([]);

  useEffect(() => {
    function podeReportar(): boolean {
      const agora = Date.now();
      const ultimos = ultimosRef.current.filter(t => agora - t < 60_000);
      ultimosRef.current = ultimos;
      if (ultimos.length >= 5) return false;
      ultimos.push(agora);
      return true;
    }

    function reportar(payload: { message: string; stack?: string; level?: "error" | "warn" | "fatal" }) {
      if (!podeReportar()) return;
      const data = {
        ...payload,
        rota:     window.location.pathname + window.location.search,
        contexto: {
          ua:    navigator.userAgent.slice(0, 200),
          // Não envia dados sensíveis — só ambiente
        },
      };
      try {
        // beacon não bloqueia + funciona em unload
        const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
        navigator.sendBeacon?.("/api/observability/error", blob)
          || fetch("/api/observability/error", {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify(data),
               keepalive: true,
             }).catch(() => {});
      } catch { /* nunca derruba app */ }
    }

    function onError(ev: ErrorEvent) {
      reportar({
        message: ev.message || "Unknown error",
        stack:   ev.error?.stack?.slice(0, 4000),
      });
    }

    function onRejection(ev: PromiseRejectionEvent) {
      const r = ev.reason;
      reportar({
        message: r?.message || String(r) || "Unhandled rejection",
        stack:   r?.stack?.slice(0, 4000),
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
