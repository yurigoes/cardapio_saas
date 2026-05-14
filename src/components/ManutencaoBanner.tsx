"use client";

/**
 * Barra fina no topo da página quando modo manutenção está ativo.
 * Gradiente animado laranja → vermelho com texto pequeno minimalista.
 *
 * Polla /api/pub/manutencao a cada 30s.
 */
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function ManutencaoBanner() {
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const r = await fetch("/api/pub/manutencao", { cache: "no-store" });
        const d = await r.json();
        if (alive) setAtivo(d.success && d.data?.ativo === true);
      } catch {}
    }
    check();
    const i = setInterval(check, 30_000);
    return () => { alive = false; clearInterval(i); };
  }, []);

  if (!ativo) return null;

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-[9998] h-7 overflow-hidden">
        {/* Gradiente animado */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#ea580c_0%,#dc2626_25%,#ea580c_50%,#dc2626_75%,#ea580c_100%)] bg-[length:200%_100%] animate-[gradientShift_3s_linear_infinite]" />
        {/* Conteúdo */}
        <div className="relative h-full flex items-center justify-center gap-2 text-white text-xs font-bold tracking-wider uppercase">
          <AlertTriangle className="h-3 w-3" />
          Modo Manutenção
        </div>
      </div>
      {/* Empurra o conteúdo embaixo pra não tampar header das páginas */}
      <div className="h-7" aria-hidden />
      <style jsx global>{`
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </>
  );
}
