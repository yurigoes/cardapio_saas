"use client";

/**
 * /admin/cloudflare-setup — guia + form pra salvar credenciais CF no master
 *
 * Depois de salvar, TODAS as instalações futuras de retaguarda usam essas
 * credenciais automaticamente (install.sh pula os prompts de CF).
 */
import { useEffect, useState } from "react";
import {
  Cloud, ExternalLink, CheckCircle2, AlertTriangle, Trash2,
  Eye, EyeOff, Save, Loader2,
} from "lucide-react";
import { confirmar } from "@/components/ui/ConfirmModal";

interface Status {
  configured:    boolean;
  account_id:    string | null;
  zone_id:       string | null;
  base_domain:   string | null;
  ativo:         boolean;
  validado_em:   string | null;
  validado_ok:   boolean | null;
  validado_erro: string | null;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function CloudflareSetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  // form
  const [apiToken, setApiToken]     = useState("");
  const [accountId, setAccountId]   = useState("");
  const [zoneId, setZoneId]         = useState("");
  const [baseDomain, setBaseDomain] = useState("tthreedigital.com.br");
  const [showToken, setShowToken]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/cloudflare-setup", { headers: authHeaders(), cache: "no-store" });
      const d = await r.json();
      if (d.success) {
        setStatus(d.data);
        if (d.data.account_id) setAccountId(d.data.account_id);
        if (d.data.zone_id)    setZoneId(d.data.zone_id);
        if (d.data.base_domain) setBaseDomain(d.data.base_domain);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function salvar() {
    if (!apiToken || !accountId || !zoneId) {
      setMsg({ type: "err", text: "Preencha os 3 campos obrigatórios" });
      return;
    }
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/cloudflare-setup", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body:    JSON.stringify({
          api_token: apiToken,
          account_id: accountId,
          zone_id:    zoneId,
          base_domain: baseDomain,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg({ type: "ok", text: "✓ Validado contra Cloudflare e salvo. Próximas instalações vão usar automaticamente." });
        setApiToken("");  // limpa pra evitar exposição
        load();
      } else {
        setMsg({ type: "err", text: d.error ?? "Erro ao salvar" });
      }
    } finally { setSaving(false); }
  }

  async function remover() {
    if (!await confirmar({ titulo: "Remover configuração Cloudflare?", mensagem: "Próximas instalações de retaguarda vão precisar dos prompts manuais novamente.", okLabel: "Remover", perigo: true })) return;
    await fetch("/api/admin/cloudflare-setup", { method: "DELETE", headers: authHeaders() });
    setApiToken(""); setAccountId(""); setZoneId("");
    load();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Cloud className="h-6 w-6 text-brand" />
          Cloudflare API
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Salve aqui 1× só. Todas as instalações futuras de retaguarda usam automaticamente sem pedir token na hora.
        </p>
      </header>

      {/* Status atual */}
      {loading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-brand"/></div>
      ) : status?.configured ? (
        <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 flex-shrink-0 mt-0.5"/>
              <div>
                <p className="text-lg font-bold text-white">Configurado</p>
                <p className="text-xs text-slate-400 mt-1">
                  Zone: <code className="text-emerald-300">{status.base_domain}</code> · Account: <code className="text-emerald-300 text-[10px]">{status.account_id?.slice(0,8)}…</code>
                </p>
                {status.validado_em && (
                  <p className="text-xs text-slate-500 mt-1">Validado em {new Date(status.validado_em).toLocaleString("pt-BR")} {status.validado_ok ? "✓" : "✗"}</p>
                )}
              </div>
            </div>
            <button onClick={remover} className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/15">
              <Trash2 className="h-3.5 w-3.5"/>
              Remover
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-400 flex-shrink-0 mt-0.5"/>
            <div>
              <p className="text-lg font-bold text-white">Não configurado</p>
              <p className="text-xs text-slate-400 mt-1">Cada install.sh vai pedir CF token, account ID e zone ID manualmente.</p>
            </div>
          </div>
        </section>
      )}

      {/* Instruções */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Como gerar credenciais Cloudflare</h2>

        <div className="space-y-3 text-sm text-slate-300">
          <div>
            <p className="font-semibold text-white mb-1">1. API Token</p>
            <p className="text-xs text-slate-400 mb-2">Vá em <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener" className="text-brand hover:underline inline-flex items-center gap-1">dash.cloudflare.com/profile/api-tokens <ExternalLink className="h-3 w-3"/></a> → <strong>Create Token</strong> → <strong>Custom token</strong>.</p>
            <div className="rounded-lg bg-slate-900/40 p-3 text-xs">
              <p className="font-semibold text-white mb-1.5">Permissões necessárias:</p>
              <ul className="space-y-0.5 text-slate-400">
                <li>• <code className="text-emerald-300">Account</code> → <code className="text-emerald-300">Cloudflare Tunnel</code> → <code className="text-amber-300">Edit</code></li>
                <li>• <code className="text-emerald-300">Zone</code> → <code className="text-emerald-300">DNS</code> → <code className="text-amber-300">Edit</code></li>
              </ul>
              <p className="font-semibold text-white mt-2 mb-1.5">Resources:</p>
              <ul className="space-y-0.5 text-slate-400">
                <li>• <code className="text-emerald-300">Include</code> → <code className="text-emerald-300">Specific account</code> → sua conta</li>
                <li>• <code className="text-emerald-300">Include</code> → <code className="text-emerald-300">Specific zone</code> → <code className="text-amber-300">{baseDomain}</code></li>
              </ul>
            </div>
          </div>

          <div>
            <p className="font-semibold text-white mb-1">2. Account ID</p>
            <p className="text-xs text-slate-400">Na sidebar direita de qualquer página da conta no dash.cloudflare.com — string de 32 caracteres hexadecimais.</p>
          </div>

          <div>
            <p className="font-semibold text-white mb-1">3. Zone ID</p>
            <p className="text-xs text-slate-400">Abra a zona <code className="text-emerald-300">{baseDomain}</code> no dash → Overview → sidebar direita → <strong>Zone ID</strong>.</p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          {status?.configured ? "Atualizar" : "Cadastrar"} credenciais
        </h2>

        <div>
          <label className="mb-1 block text-xs text-slate-400">
            API Token <span className="text-red-400">*</span>
            {status?.configured && <span className="ml-2 text-slate-500">(deixe vazio pra manter o atual; só preencha pra trocar)</span>}
          </label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={apiToken}
              onChange={e => setApiToken(e.target.value)}
              placeholder={status?.configured ? "•••••••• (preencha só pra trocar)" : "cole o token aqui"}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-10 text-sm text-white font-mono focus:border-brand/40 focus:outline-none"
            />
            <button
              onClick={() => setShowToken(s => !s)}
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-white"
            >
              {showToken ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Account ID <span className="text-red-400">*</span></label>
            <input
              value={accountId}
              onChange={e => setAccountId(e.target.value.trim().toLowerCase())}
              placeholder="32 hex chars"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white font-mono focus:border-brand/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Zone ID <span className="text-red-400">*</span></label>
            <input
              value={zoneId}
              onChange={e => setZoneId(e.target.value.trim().toLowerCase())}
              placeholder="32 hex chars"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white font-mono focus:border-brand/40 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Domínio base (zona)</label>
          <input
            value={baseDomain}
            onChange={e => setBaseDomain(e.target.value.trim().toLowerCase())}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white font-mono focus:border-brand/40 focus:outline-none"
          />
        </div>

        {msg && (
          <p className={`text-sm rounded-lg px-3 py-2 ${msg.type === "ok" ? "border border-emerald-400/20 bg-emerald-500/5 text-emerald-300" : "border border-red-500/20 bg-red-500/5 text-red-400"}`}>
            {msg.text}
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={salvar}
            disabled={saving || !accountId || !zoneId || (!apiToken && !status?.configured)}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}
            Validar e salvar
          </button>
        </div>
      </section>

      <footer className="rounded-xl border border-white/5 bg-white/5 p-4 text-xs text-slate-500">
        ⓘ O API token é cifrado com <code className="text-slate-400">ENCRYPTION_KEY</code> antes de ir pro banco.
        Quando uma retaguarda nova é instalada via wizard ({"/admin/retaguardas"} → + Nova),
        o install.sh recebe esses dados via token de uso único e pula os prompts de Cloudflare.
      </footer>
    </div>
  );
}
