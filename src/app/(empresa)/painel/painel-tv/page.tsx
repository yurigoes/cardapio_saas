"use client";

/**
 * /painel/painel-tv — Redireciona para /painel/[slug] (painel TV público)
 * Precisa do slug da empresa, que buscamos via /api/auth/me.
 */
import { useEffect, useState } from "react";
import { Tv2, ExternalLink } from "lucide-react";

export default function PainelTVRedirect() {
  const [slug, setSlug]       = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setSlug(data.data?.empresa?.slug || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!slug) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-400">Slug da empresa não encontrado.</p>
      </div>
    );
  }

  const url = `/painel/${slug}`;

  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-white/10 bg-slate-900 p-12 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500/10">
        <Tv2 className="h-10 w-10 text-amber-400" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-white">Painel de Atendimento (TV)</h1>
        <p className="mt-2 text-sm text-slate-400">
          Exiba este painel em uma TV ou monitor no salão para chamar clientes.
        </p>
      </div>

      <div className="space-y-3 w-full max-w-sm">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-4 font-semibold text-white hover:bg-amber-400 transition"
        >
          <ExternalLink className="h-5 w-5" />
          Abrir Painel em nova aba
        </a>

        <div className="rounded-xl border border-white/10 bg-slate-800 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">URL do painel</p>
          <code className="text-sm text-brand break-all">{typeof window !== "undefined" ? window.location.origin : ""}{url}</code>
        </div>

        <div className="rounded-xl border border-white/5 bg-slate-800/50 p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-slate-300">Como usar:</p>
          <ul className="space-y-1.5 text-xs text-slate-400">
            <li>• Abra o link acima em um tablet ou TV conectado ao Wi-Fi</li>
            <li>• Pressione F11 para tela cheia</li>
            <li>• No KDS (Cozinha), clique em <strong className="text-white">Chamar</strong> quando o pedido estiver pronto</li>
            <li>• O número e nome do cliente aparecerão automaticamente</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
