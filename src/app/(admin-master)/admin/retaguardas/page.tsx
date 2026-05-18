"use client";

/**
 * /admin/retaguardas — Listagem de retaguardas (master)
 *
 * Mostra todas as retaguardas cadastradas com status online/offline,
 * último heartbeat, IP e domínio. Permite forçar refresh.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Server, RefreshCw, CircleCheck, CircleAlert, CircleX, Globe, Plus, Copy, X } from "lucide-react";

interface Retaguarda {
  id:                string;
  retaguarda_id:     string;
  empresa_slug:      string;
  dominio:           string | null;
  ip_publico:        string | null;
  versao:            string | null;
  primeira_vez:      string;
  ultimo_heartbeat:  string;
  segundos_desde:    number;
  online:            boolean;
  label_status:      "online" | "instavel" | "offline";
  metricas:          Record<string, unknown>;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function tempoRelativo(s: number): string {
  if (s < 60)         return `${s}s atrás`;
  if (s < 3600)       return `${Math.floor(s / 60)}min atrás`;
  if (s < 86400)      return `${Math.floor(s / 3600)}h atrás`;
  return `${Math.floor(s / 86400)}d atrás`;
}

export default function RetaguardasPage() {
  const [data,    setData]    = useState<Retaguarda[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");
  const [modalNova, setModalNova] = useState(false);

  async function load() {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/admin/retaguardas", { headers: authHeaders(), cache: "no-store" });
      const d = await r.json();
      if (!d.success) { setErr(d.error || "Erro"); return; }
      setData(d.data ?? []);
    } catch { setErr("Erro de conexão"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const online   = data.filter(r => r.label_status === "online").length;
  const instavel = data.filter(r => r.label_status === "instavel").length;
  const offline  = data.filter(r => r.label_status === "offline").length;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Server className="h-6 w-6 text-brand" />
            Retaguardas
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Mini-PCs nas lojas servindo cache local e reduzindo carga do master.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModalNova(true)}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition"
          >
            <Plus className="h-4 w-4" />
            Nova retaguarda
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </header>

      {modalNova && <NovaRetaguardaModal onClose={() => setModalNova(false)} />}

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-emerald-400" />
            <p className="text-xs uppercase text-slate-400">Online</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-white">{online}</p>
        </div>
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-amber-400" />
            <p className="text-xs uppercase text-slate-400">Instável</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-white">{instavel}</p>
        </div>
        <div className="rounded-xl border border-red-400/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2">
            <CircleX className="h-4 w-4 text-red-400" />
            <p className="text-xs uppercase text-slate-400">Offline</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-white">{offline}</p>
        </div>
      </div>

      {err && <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{err}</p>}

      {/* Tabela */}
      {loading && data.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/5 p-12 text-center text-slate-500">
          <Server className="mx-auto h-10 w-10 opacity-30 mb-3" />
          <p className="text-sm">Nenhuma retaguarda registrada ainda.</p>
          <p className="mt-1 text-xs">Instale o pacote em /retaguarda no mini-PC do restaurante.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5 bg-white/5">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-left">Domínio</th>
                <th className="px-4 py-3 text-left">IP</th>
                <th className="px-4 py-3 text-left">Último heartbeat</th>
                <th className="px-4 py-3 text-left">Cadastrada</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => window.location.href = `/admin/retaguardas/${r.id}`}>
                  <td className="px-4 py-3 text-white font-medium">
                    <Link href={`/admin/retaguardas/${r.id}`} className="hover:text-brand transition">{r.empresa_slug}</Link>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {r.dominio ? (
                      <span className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-slate-500" />
                        {r.dominio}
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.ip_publico ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{tempoRelativo(r.segundos_desde)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(r.primeira_vez).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    {r.label_status === "online" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        online
                      </span>
                    )}
                    {r.label_status === "instavel" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        instável
                      </span>
                    )}
                    {r.label_status === "offline" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        offline
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="rounded-xl border border-white/5 bg-white/5 p-4 text-xs text-slate-500">
        Heartbeat a cada 60s. Considera <strong className="text-slate-400">online</strong> se &lt; 90s,
        <strong className="text-amber-400"> instável</strong> entre 90–180s,
        <strong className="text-red-400"> offline</strong> &gt; 180s.
        Atualiza automaticamente a cada 30s.
      </footer>
    </div>
  );
}

// ─── Modal de criação ────────────────────────────────────────────────────────
interface NovaResp {
  token: string;
  expires_at: string;
  empresa_slug: string;
  retaguarda_domain: string;
  master_url: string;
  install_command: string;
  install_command_github: string;
}

function NovaRetaguardaModal({ onClose }: { onClose: () => void }) {
  const [slug, setSlug]       = useState("");
  const [sub, setSub]         = useState("");
  const [domain, setDomain]   = useState("tthreedigital.com.br");
  const [resp, setResp]       = useState<NovaResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");
  const [copied, setCopied]   = useState(false);

  async function gerar() {
    if (!slug) { setErr("Informe slug da empresa"); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/admin/retaguardas/install-token", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body:    JSON.stringify({
          empresa_slug: slug,
          subdomain:    sub || undefined,
          base_domain:  domain,
        }),
      });
      const d = await r.json();
      if (!d.success) { setErr(d.error || "Erro"); return; }
      setResp(d.data);
    } catch { setErr("Erro de conexão"); }
    finally { setLoading(false); }
  }

  function copy(s: string) {
    navigator.clipboard.writeText(s).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-6">
        <header className="flex items-center justify-between mb-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Plus className="h-5 w-5 text-brand" />
            Nova retaguarda
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/10">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </header>

        {!resp ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Gera um token de uso único (válido 24h). Cola o comando curl gerado no terminal do mini-PC novo — o script faz tudo automaticamente: instala Docker, cria Cloudflare Tunnel, sobe containers.
            </p>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Slug da empresa <span className="text-red-400">*</span></label>
              <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="ex: top-cozinha-oriental"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Subdomínio</label>
                <input value={sub} onChange={e => setSub(e.target.value)} placeholder="auto: loja-{slug}"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Domínio base</label>
                <input value={domain} onChange={e => setDomain(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none" />
              </div>
            </div>

            {err && <p className="text-sm text-red-400">{err}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Cancelar</button>
              <button onClick={gerar} disabled={loading || !slug} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
                {loading ? "Gerando..." : "Gerar token + comando"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">✓ Token gerado</p>
              <p className="mt-1 text-sm text-white">{resp.retaguarda_domain}</p>
              <p className="text-[10px] text-slate-400">Expira em {new Date(resp.expires_at).toLocaleString("pt-BR")}</p>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Comando pra rodar no mini-PC novo (como root):</label>
              <pre className="rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all">
{resp.install_command}
              </pre>
              <button
                onClick={() => copy(resp.install_command)}
                className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copiado!" : "Copiar comando"}
              </button>
              <details className="mt-2 text-[11px] text-slate-500">
                <summary className="cursor-pointer hover:text-slate-300">Alternativa via GitHub (se master estiver fora)</summary>
                <pre className="mt-2 rounded-lg border border-white/10 bg-black/40 p-3 text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all">{resp.install_command_github}</pre>
              </details>
            </div>

            <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-200">
              <p className="font-semibold mb-1">⚠ Você ainda precisa:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>CF API Token, Account ID, Zone ID (do dashboard Cloudflare)</li>
                <li>Esses dados o script pede no terminal — uma vez por instalação</li>
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={onClose} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110">Fechar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
