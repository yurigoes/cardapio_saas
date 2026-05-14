"use client";

/**
 * /painel/kiosk — gera URLs sem login pra TVs/totens dedicados.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Tv2, ChefHat, Bike, Printer, Plus, Copy, Check, Trash2,
  ExternalLink, RefreshCw, AlertTriangle,
} from "lucide-react";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";

interface Token {
  id:         string;
  tipo:       string;
  prefix:     string;
  ativo:      boolean;
  ultimo_uso: string | null;
  ultimo_ip:  string | null;
  created_at: string;
}

const TIPOS = [
  { key: "cozinha",  label: "Cozinha (KDS)",          icon: ChefHat,  cor: "text-orange-400 border-orange-500/30 bg-orange-500/5" },
  { key: "tv",       label: "TV - Pedidos prontos",   icon: Tv2,      cor: "text-blue-400 border-blue-500/30 bg-blue-500/5" },
  { key: "delivery", label: "Delivery - Em rota",     icon: Bike,     cor: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" },
];

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR") : "—";

export default function KioskPage() {
  const [tokens, setTokens]   = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);
  const [novaUrl, setNovaUrl] = useState<{ tipo: string; url: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/painel/kiosk-tokens", { headers: auth() });
      const d = await r.json();
      if (d.success) setTokens(d.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function gerar(tipo: string) {
    if (!await confirmar({ titulo: `Gerar URL kiosk para ${tipo}?`, mensagem: "Se já existe uma, será substituída." })) return;
    setBusy(tipo);
    try {
      const r = await fetch("/api/painel/kiosk-tokens", {
        method: "POST", headers: auth(),
        body: JSON.stringify({ tipo }),
      });
      const d = await r.json();
      if (d.success) {
        setNovaUrl({ tipo, url: d.data.url });
        carregar();
      } else await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
    } finally { setBusy(null); }
  }

  function copiar(s: string) {
    navigator.clipboard.writeText(s).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  }

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Tv2 className="h-5 w-5 text-emerald-400" />
            Painéis kiosk (sem login)
          </h1>
          <p className="text-sm text-slate-400">
            Gere URLs fixas pra TVs/totens dedicados — não exige login, ideal pra
            cozinha, painel de chamada, ou central de delivery.
          </p>
        </div>
        <button onClick={carregar}
          className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
          <RefreshCw className={`h-3.5 w-3.5 inline ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {novaUrl && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white">URL gerada para "{novaUrl.tipo}"</h3>
            <button onClick={() => setNovaUrl(null)}
              className="text-slate-400 hover:text-white text-sm">×</button>
          </div>
          <div className="rounded-xl bg-slate-900 p-3 flex items-center gap-2">
            <code className="flex-1 text-xs font-mono text-emerald-300 break-all">{novaUrl.url}</code>
            <button onClick={() => copiar(novaUrl.url)}
              className="rounded-lg bg-emerald-500 p-2 text-white hover:brightness-110">
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
            <a href={novaUrl.url} target="_blank" rel="noopener noreferrer"
              className="rounded-lg bg-blue-500 p-2 text-white hover:brightness-110">
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p>Salve essa URL agora. Cole no navegador do PC/TV dedicado e marque como página inicial. Não precisa mais de login.</p>
          </div>
        </div>
      )}

      <section className="grid sm:grid-cols-3 gap-3">
        {TIPOS.map(t => {
          const Icon = t.icon;
          const tok  = tokens.find(x => x.tipo === t.key);
          return (
            <div key={t.key} className={`rounded-2xl border p-4 ${t.cor}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-5 w-5" />
                <p className="font-bold text-white">{t.label}</p>
              </div>
              {tok ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400 font-mono">{tok.prefix}***</p>
                  <p className="text-xs text-slate-500">
                    Último uso: {fmtData(tok.ultimo_uso)}
                    {tok.ultimo_ip && <><br />IP: {tok.ultimo_ip}</>}
                  </p>
                  <button onClick={() => gerar(t.key)} disabled={busy === t.key}
                    className="w-full rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50">
                    Regenerar URL
                  </button>
                </div>
              ) : (
                <button onClick={() => gerar(t.key)} disabled={busy === t.key}
                  className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 px-3 py-2 text-xs font-bold text-white inline-flex items-center justify-center gap-1">
                  {busy === t.key ? "..." : <><Plus className="h-3.5 w-3.5" /> Gerar URL</>}
                </button>
              )}
            </div>
          );
        })}
      </section>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
        <p className="font-bold text-white mb-1">Como usar:</p>
        <ol className="list-decimal pl-5 space-y-1 text-xs">
          <li>Clica em "Gerar URL" pro tipo de painel desejado</li>
          <li>Copia a URL completa (com <code>?t=kio_xxx</code>)</li>
          <li>No PC/TV dedicado, abre a URL no navegador e fixa como página inicial</li>
          <li>Painel atualiza automaticamente a cada 5s — sem login, sem timeout</li>
        </ol>
      </div>
    </div>
  );
}
