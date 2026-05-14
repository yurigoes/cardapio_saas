"use client";

/**
 * /painel/api-keys — gerencia API keys da empresa.
 * Master/admin only.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Key, Plus, Trash2, Copy, Check, AlertTriangle, RefreshCw, ExternalLink,
} from "lucide-react";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";

interface ApiKey {
  id:           string;
  nome:         string;
  prefix:       string;
  scopes:       string[];
  ativo:        boolean;
  ultimo_uso_em: string | null;
  ultimo_uso_ip: string | null;
  expira_em:    string | null;
  created_at:   string;
}

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export default function ApiKeysPage() {
  const [keys, setKeys]       = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novosScopes, setNovosScopes] = useState<string[]>(["read"]);
  const [keyCriada, setKeyCriada] = useState<{ key: string; nome: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch("/api/painel/api-keys", { headers: { Authorization: `Bearer ${t}` } });
      const d = await r.json();
      if (d.success) setKeys(d.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function criar() {
    if (!novoNome.trim()) return;
    setCriando(true);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch("/api/painel/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ nome: novoNome.trim(), scopes: novosScopes }),
      });
      const d = await r.json();
      if (d.success) {
        setKeyCriada({ key: d.data.key, nome: d.data.nome });
        setNovoNome("");
        setNovosScopes(["read"]);
        carregar();
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
      }
    } finally { setCriando(false); }
  }

  async function revogar(k: ApiKey) {
    if (!await confirmar({ titulo: `Revogar key "${k.nome}"?`, mensagem: "Aplicações usando essa key vão parar de funcionar imediatamente.", okLabel: "Revogar", perigo: true })) return;
    const t = localStorage.getItem("access_token") ?? "";
    const r = await fetch(`/api/painel/api-keys/${k.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
    const d = await r.json();
    if (d.success) carregar();
  }

  async function toggleScope(s: string) {
    setNovosScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  function copiar(k: string) {
    navigator.clipboard.writeText(k).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Key className="h-5 w-5 text-emerald-400" />
            API Keys
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Chaves para integrações externas usarem a{" "}
            <a href="/docs/api" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-1">
              API v1 <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Modal de key criada (mostra UMA VEZ) */}
      {keyCriada && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-emerald-400" />
            <h3 className="font-bold text-white">Key &ldquo;{keyCriada.nome}&rdquo; criada</h3>
          </div>
          <div className="rounded-xl bg-slate-900 p-3 flex items-center gap-2">
            <code className="flex-1 text-xs font-mono text-emerald-300 break-all">{keyCriada.key}</code>
            <button
              onClick={() => copiar(keyCriada.key)}
              className="rounded-lg bg-emerald-500 p-2 text-white hover:brightness-110"
            >
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p>Salve esta key agora. Não vai ser possível visualizá-la novamente — só revogar e gerar nova.</p>
          </div>
          <button
            onClick={() => setKeyCriada(null)}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:brightness-110"
          >
            Já salvei, fechar
          </button>
        </div>
      )}

      {/* Form criar */}
      {!keyCriada && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Plus className="h-4 w-4" /> Nova API key
          </h3>
          <input
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            placeholder="Nome (ex: Integração ERP, App parceiro X)"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Scopes</p>
            <div className="flex gap-2">
              {(["read", "write", "admin"] as const).map(s => (
                <label key={s} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition ${
                  novosScopes.includes(s)
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 bg-white/5 text-slate-400"
                }`}>
                  <input
                    type="checkbox"
                    checked={novosScopes.includes(s)}
                    onChange={() => toggleScope(s)}
                    className="accent-emerald-500"
                  />
                  <span className="font-mono text-xs">{s}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              <code>read</code> = GET · <code>write</code> = POST/PATCH/DELETE · <code>admin</code> = todos
            </p>
          </div>
          <button
            onClick={criar}
            disabled={!novoNome.trim() || novosScopes.length === 0 || criando}
            className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-40 transition"
          >
            {criando ? "Gerando..." : "Gerar API key"}
          </button>
        </div>
      )}

      {/* Lista */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="border-b border-white/5 p-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Keys ativas ({keys.filter(k => k.ativo).length})
        </div>
        {keys.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Nenhuma key criada</p>
        ) : (
          <div className="divide-y divide-white/5">
            {keys.map(k => (
              <div key={k.id} className="p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white truncate">{k.nome}</p>
                    {!k.ativo && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">REVOGADA</span>}
                  </div>
                  <p className="mt-1 text-xs font-mono text-slate-500">{k.prefix}***</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                    {k.scopes.map(s => (
                      <span key={s} className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-emerald-400">
                        {s}
                      </span>
                    ))}
                    <span className="text-slate-500">
                      criada {fmtDate(k.created_at)}
                    </span>
                    {k.ultimo_uso_em && (
                      <span className="text-slate-500">
                        · último uso {fmtDate(k.ultimo_uso_em)} {k.ultimo_uso_ip ? `(${k.ultimo_uso_ip})` : ""}
                      </span>
                    )}
                  </div>
                </div>
                {k.ativo && (
                  <button
                    onClick={() => revogar(k)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition"
                    title="Revogar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
