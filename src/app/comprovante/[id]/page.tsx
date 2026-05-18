"use client";

/**
 * /comprovante/[id]?tipo=mensalidade|avulsa
 *
 * Página standalone (sem layout do painel) que abre em nova aba,
 * lê token do localStorage e busca o HTML do comprovante via fetch
 * autenticado. Resolve o problema de "Unauthorized" ao abrir o
 * endpoint direto numa nova aba (links não carregam header Authorization).
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";

export default function ComprovanteViewer() {
  const { id }   = useParams<{ id: string }>();
  const sp       = useSearchParams();
  const tipo     = sp?.get("tipo") ?? "mensalidade";
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("access_token");
    if (!token) {
      window.location.href = `/login?next=${encodeURIComponent(`/comprovante/${id}?tipo=${tipo}`)}`;
      return;
    }

    fetch(`/api/painel/mensalidades/${id}/comprovante?tipo=${tipo}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async r => {
        if (!r.ok) {
          const txt = await r.text();
          try { const j = JSON.parse(txt); throw new Error(j.error ?? txt); }
          catch { throw new Error(txt.slice(0, 200)); }
        }
        return r.text();
      })
      .then(html => {
        // Substitui o documento inteiro pelo HTML do comprovante
        // (o HTML já vem com tags <html><body>...)
        document.open();
        document.write(html);
        document.close();
      })
      .catch(e => setErro(e.message ?? "Falha ao carregar comprovante"));
  }, [id, tipo]);

  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
        <div className="max-w-md text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto" />
          <h1 className="text-xl font-bold">Erro ao carregar comprovante</h1>
          <p className="text-sm text-slate-400">{erro}</p>
          <button onClick={() => window.close()}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        <p className="text-sm text-slate-400">Carregando comprovante…</p>
      </div>
    </div>
  );
}
