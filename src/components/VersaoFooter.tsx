"use client";

/**
 * Rodapé com versões do sistema e agentes.
 * Usado no fim das sidebars (admin/painel) abaixo do botão Sair.
 */
import { useEffect, useState } from "react";

interface Versoes {
  sistema:     string;
  print_agent: string | null;
  vps_agent:   string | null;
}

let cache: Versoes | null = null;

export function VersaoFooter({ mostrarVps }: { mostrarVps?: boolean } = {}) {
  const [v, setV] = useState<Versoes | null>(cache);

  useEffect(() => {
    if (cache) return;
    fetch("/api/pub/versao", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          cache = d.data;
          setV(d.data);
        }
      })
      .catch(() => {});
  }, []);

  if (!v) return null;

  return (
    <div className="border-t border-white/5 px-3 py-2 text-[10px] text-slate-600 leading-tight space-y-0.5">
      <div className="flex items-center justify-between">
        <span>Sistema</span>
        <code className="text-slate-500">v{v.sistema}</code>
      </div>
      {v.print_agent && (
        <div className="flex items-center justify-between">
          <span>Print agent</span>
          <code className="text-slate-500">v{v.print_agent}</code>
        </div>
      )}
      {mostrarVps && v.vps_agent && (
        <div className="flex items-center justify-between">
          <span>VPS agent</span>
          <code className="text-slate-500">v{v.vps_agent}</code>
        </div>
      )}
    </div>
  );
}
