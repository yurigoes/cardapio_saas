"use client";

/**
 * Componente: seletor de filial pra usuários de rede.
 * Aparece no header do /painel quando o usuário pertence a uma rede.
 * Troca de filial gera novo access_token + reload.
 */
import { useEffect, useState } from "react";
import { Building2, ChevronDown, Check, Loader2 } from "lucide-react";

interface Filial {
  id: string; nome_fantasia: string; nome_filial: string | null;
  is_matriz: boolean; status: string;
}

interface RedeInfo {
  scope: { empresa_id: string; empresa_nome: string; rede_id: string | null; rede_nome: string | null };
  rede: { id: string; nome: string; logo_url: string | null; cor_primaria: string | null } | null;
  filiais: Filial[];
  pode_trocar: boolean;
}

export function SeletorFilial() {
  const [info, setInfo] = useState<RedeInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [trocando, setTrocando] = useState<string | null>(null);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!t) return;
    fetch("/api/painel/rede", {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(r => r.json())
      .then(d => { if (d.success) setInfo(d.data); })
      .catch(() => {});
  }, []);

  // Sem rede ou sem permissão de trocar → não mostra
  if (!info?.scope?.rede_id && !info?.rede) return null;
  if (!info.pode_trocar || info.filiais.length <= 1) {
    // Mostra só badge "Rede X · Filial Y" estático
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
        <Building2 className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-slate-300">{info.rede?.nome}</span>
        <span className="text-slate-500">·</span>
        <span className="font-bold text-white">{info.scope.empresa_nome}</span>
      </div>
    );
  }

  const atual = info.filiais.find(f => f.id === info.scope.empresa_id);

  async function trocar(filialId: string) {
    setTrocando(filialId);
    try {
      const t = localStorage.getItem("access_token");
      const r = await fetch("/api/painel/rede/trocar-filial", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ filial_id: filialId }),
      });
      const d = await r.json();
      if (!d.success) {
        alert("Falha: " + (typeof d.error === "string" ? d.error : "?"));
        return;
      }
      // Salva novo token e recarrega
      localStorage.setItem("access_token", d.data.access_token);
      window.location.reload();
    } finally { setTrocando(null); }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20">
        <Building2 className="h-3.5 w-3.5" />
        <span>{info.rede?.nome}</span>
        <span className="text-emerald-400">·</span>
        <span className="font-bold">{atual?.nome_filial ?? atual?.nome_fantasia ?? "?"}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
            <div className="border-b border-white/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Trocar de filial</p>
              <p className="text-xs text-slate-400">{info.rede?.nome}</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {info.filiais.map(f => {
                const ativa = f.id === info.scope.empresa_id;
                return (
                  <button key={f.id}
                    onClick={() => !ativa && trocar(f.id)}
                    disabled={trocando !== null || f.status === "suspenso" || f.status === "inativo"}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5 disabled:opacity-50 ${
                      ativa ? "bg-emerald-500/10 text-emerald-300" : "text-slate-300"
                    }`}>
                    <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {f.nome_filial ?? f.nome_fantasia}
                        {f.is_matriz && <span className="ml-1 text-[10px] text-amber-400">★ MATRIZ</span>}
                      </p>
                      {f.nome_filial && (
                        <p className="text-[10px] text-slate-500 truncate">{f.nome_fantasia}</p>
                      )}
                      {f.status !== "ativo" && (
                        <p className="text-[10px] text-red-400 uppercase">{f.status}</p>
                      )}
                    </div>
                    {trocando === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                     ativa ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
