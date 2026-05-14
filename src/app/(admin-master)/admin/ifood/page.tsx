"use client";

/**
 * /admin/ifood — Master configura UMA app iFood Distribuída que serve
 * todas empresas clientes. Cada empresa só precisa autorizar (1 clique).
 */
import { useEffect, useState, useCallback } from "react";
import {
  Zap, Save, Loader2, AlertTriangle, CheckCircle2, Eye, EyeOff,
  ExternalLink, ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { alertar } from "@/components/ui/ConfirmModal";

interface Cfg {
  client_id:     string | null;
  client_secret: string | null;
  app_nome:      string | null;
  ativo:         boolean;
  ultimo_userCode_em: string | null;
  ultimo_erro:   string | null;
  ultimo_erro_em: string | null;
}

function authHeader(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

export default function IfoodMasterPage() {
  const [cfg, setCfg]         = useState<Partial<Cfg>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [showId, setShowId]   = useState(false);
  const [showSec, setShowSec] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/ifood/master", { headers: authHeader() });
      const d = await r.json();
      if (d.success) setCfg(d.data ?? {});
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/ifood/master", {
        method: "PATCH", headers: authHeader(),
        body: JSON.stringify({
          client_id:     cfg.client_id === "********" ? undefined : cfg.client_id ?? null,
          client_secret: cfg.client_secret === "********" ? undefined : cfg.client_secret ?? null,
          app_nome:      cfg.app_nome ?? null,
          ativo:         cfg.ativo ?? false,
        }),
      });
      const d = await r.json();
      if (d.success) {
        await alertar({ titulo: "Config salva", tipo: "sucesso" });
        carregar();
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
      }
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex h-60 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-red-500" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl pb-12">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <Zap className="h-5 w-5 text-red-400" /> iFood — App Distribuído
        </h1>
        <p className="mt-0.5 text-sm text-slate-400">
          UMA app no iFood Developer serve todas empresas clientes do SaaS.
          Cada empresa só clica &quot;Conectar com iFood&quot; e autoriza no portal.
        </p>
      </div>

      <section className={`rounded-2xl border p-4 ${
        cfg.ativo
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      }`}>
        <div className="flex items-center gap-3">
          {cfg.ativo
            ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            : <AlertTriangle className="h-5 w-5 text-amber-400" />}
          <div className="flex-1">
            <p className="text-sm font-bold text-white">
              {cfg.ativo ? `App "${cfg.app_nome ?? "Distribuído"}" ativa` : "App Distribuída desativada"}
            </p>
            {cfg.ultimo_erro && (
              <p className="text-xs text-red-300 mt-1">⚠ Último erro: {cfg.ultimo_erro}</p>
            )}
          </div>
        </div>
      </section>

      {/* Setup guide */}
      <section className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs space-y-2">
        <p className="font-bold text-blue-300">📋 Como criar a app Distribuída no iFood:</p>
        <ol className="text-slate-300 list-decimal list-inside space-y-1 pl-2">
          <li>
            <a href="https://developer.ifood.com.br" target="_blank" rel="noopener" className="text-blue-300 underline inline-flex items-center gap-1">
              developer.ifood.com.br <ExternalLink className="h-3 w-3" />
            </a> → <strong>Meus Apps</strong> → <strong>Cadastrar aplicativo</strong>
          </li>
          <li>Tipo: <strong>Distribuído</strong></li>
          <li>Permissões necessárias: <code>Merchant</code>, <code>Order</code>, <code>Events</code>, <code>Catalog</code> (opcional)</li>
          <li>Após criar: aba <strong>Credenciais</strong> → copia clientId + clientSecret e cola abaixo</li>
          <li>Salva + ativa. Pronto — cada cliente do SaaS pode conectar a loja dele com 1 clique.</li>
        </ol>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Credenciais da app Distribuída
        </h2>

        <label className="block">
          <span className="text-xs font-medium text-slate-400 mb-1 block">Nome do app (interno)</span>
          <input type="text" value={cfg.app_nome ?? ""}
            onChange={e => setCfg({ ...cfg, app_nome: e.target.value })}
            placeholder="Ex: Cardápio SaaS - Produção"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400 mb-1 block">Client ID *</span>
          <div className="relative">
            <input type={showId ? "text" : "password"} value={cfg.client_id ?? ""}
              onChange={e => setCfg({ ...cfg, client_id: e.target.value })}
              placeholder="UUID do iFood developer"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 pr-10 text-sm font-mono text-white" />
            <button type="button" onClick={() => setShowId(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              {showId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400 mb-1 block">Client Secret *</span>
          <div className="relative">
            <input type={showSec ? "text" : "password"} value={cfg.client_secret ?? ""}
              onChange={e => setCfg({ ...cfg, client_secret: e.target.value })}
              placeholder="Secret do iFood developer (vê só 1 vez)"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 pr-10 text-sm font-mono text-white" />
            <button type="button" onClick={() => setShowSec(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              {showSec ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-300 mt-3">
          <input type="checkbox" checked={cfg.ativo ?? false}
            onChange={e => setCfg({ ...cfg, ativo: e.target.checked })}
            className="accent-emerald-500" />
          <span>Ativar — empresas podem conectar suas lojas</span>
        </label>

        <button onClick={salvar} disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-red-500 hover:bg-red-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar configuração"}
        </button>
      </section>
    </div>
  );
}
