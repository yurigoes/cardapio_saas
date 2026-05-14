"use client";

/**
 * /admin/billing — Master configura Mercado Pago pra receber mensalidades
 * + módulos extras.
 */
import { useEffect, useState, useCallback } from "react";
import {
  CreditCard, Save, Loader2, AlertTriangle, CheckCircle2, Eye, EyeOff,
  ExternalLink, FileText, ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { alertar } from "@/components/ui/ConfirmModal";

interface Cfg {
  mp_access_token:   string | null;
  mp_public_key:     string | null;
  mp_webhook_secret: string | null;
  ativo:             boolean;
  modo:              "sandbox" | "producao";
  vencimento_dia:    number;
  juros_atraso_pct:  number;
  multa_atraso_pct:  number;
  ultimo_envio:      string | null;
  ultimo_status:     string | null;
  ultimo_erro:       string | null;
}

function authHeader(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

export default function BillingPage() {
  const [cfg, setCfg]         = useState<Partial<Cfg>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [showTok, setShowTok] = useState(false);
  const [showSec, setShowSec] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/billing/config", { headers: authHeader() });
      const d = await r.json();
      if (d.success) setCfg(d.data ?? {});
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/billing/config", {
        method: "PATCH", headers: authHeader(),
        body: JSON.stringify({
          mp_access_token:   cfg.mp_access_token === "********" ? undefined : cfg.mp_access_token ?? null,
          mp_public_key:     cfg.mp_public_key ?? null,
          mp_webhook_secret: cfg.mp_webhook_secret === "********" ? undefined : cfg.mp_webhook_secret ?? null,
          ativo:             cfg.ativo ?? false,
          modo:              cfg.modo ?? "sandbox",
          vencimento_dia:    cfg.vencimento_dia ?? 10,
          juros_atraso_pct:  Number(cfg.juros_atraso_pct ?? 0),
          multa_atraso_pct:  Number(cfg.multa_atraso_pct ?? 0),
        }),
      });
      const d = await r.json();
      if (d.success) {
        await alertar({ titulo: "Config salva", tipo: "sucesso" });
        carregar();
      } else {
        await alertar({ titulo: "Falha ao salvar", mensagem: d.error?.message ?? "", tipo: "perigo" });
      }
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex h-60 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl pb-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <CreditCard className="h-5 w-5 text-emerald-400" /> Mercado Pago do master
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Token usado pra cobrar mensalidades das empresas + módulos extras.
            Diferente dos gateways das empresas (configurados em /painel/gateways).
          </p>
        </div>
        <Link href="/admin/financeiro/mensalidades"
          className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
          <FileText className="h-3.5 w-3.5" /> Mensalidades <ArrowRight className="h-3 w-3" />
        </Link>
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
              {cfg.ativo
                ? `Mercado Pago ${cfg.modo === "producao" ? "PRODUÇÃO" : "SANDBOX"} ativo`
                : "Mercado Pago desativado"}
            </p>
            {cfg.ultimo_status === "erro" && cfg.ultimo_erro && (
              <p className="text-xs text-red-300 mt-1">⚠ Último erro: {cfg.ultimo_erro}</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Credenciais Mercado Pago
        </h2>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-200">
          <p className="font-bold mb-1">Onde pegar:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Login em <a href="https://www.mercadopago.com.br/developers/panel" target="_blank" rel="noopener" className="underline inline-flex items-center gap-1">developers.mercadopago.com.br <ExternalLink className="h-3 w-3" /></a></li>
            <li>Crie aplicação tipo <strong>&quot;CheckoutPro + Suscripciones&quot;</strong></li>
            <li>Copie <code>Access token</code> de <strong>{cfg.modo === "producao" ? "Producción" : "Sandbox"}</strong></li>
            <li>Configure webhook: <code className="text-[10px]">{typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/mercadopago-saas</code></li>
            <li>Eventos: <code>payment</code> + <code>subscription_preapproval</code> + <code>subscription_authorized_payment</code></li>
            <li>Copie <code>Secret</code> do webhook</li>
          </ol>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-400 mb-1 block">Access Token *</span>
          <div className="relative">
            <input type={showTok ? "text" : "password"}
              value={cfg.mp_access_token ?? ""}
              onChange={e => setCfg({ ...cfg, mp_access_token: e.target.value })}
              placeholder={cfg.modo === "producao" ? "APP_USR-..." : "TEST-..."}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 pr-10 text-sm font-mono text-white" />
            <button type="button" onClick={() => setShowTok(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              {showTok ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400 mb-1 block">Public Key (opcional, pra Checkout Transparente futuro)</span>
          <input type="text" value={cfg.mp_public_key ?? ""}
            onChange={e => setCfg({ ...cfg, mp_public_key: e.target.value })}
            placeholder={cfg.modo === "producao" ? "APP_USR-pub-..." : "TEST-pub-..."}
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm font-mono text-white" />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400 mb-1 block">Webhook Secret (HMAC validation) *</span>
          <div className="relative">
            <input type={showSec ? "text" : "password"}
              value={cfg.mp_webhook_secret ?? ""}
              onChange={e => setCfg({ ...cfg, mp_webhook_secret: e.target.value })}
              placeholder="Cole o secret do webhook MP aqui"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 pr-10 text-sm font-mono text-white" />
            <button type="button" onClick={() => setShowSec(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              {showSec ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Modo</span>
            <select value={cfg.modo ?? "sandbox"}
              onChange={e => setCfg({ ...cfg, modo: e.target.value as "sandbox" | "producao" })}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white">
              <option value="sandbox">Sandbox (testes)</option>
              <option value="producao">Produção (cobra de verdade)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300 mt-5">
            <input type="checkbox" checked={cfg.ativo ?? false}
              onChange={e => setCfg({ ...cfg, ativo: e.target.checked })}
              className="accent-emerald-500" />
            <span>Ativar cobranças</span>
          </label>
        </div>

        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mt-6">
          Defaults pras mensalidades
        </h2>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Dia vencimento</span>
            <input type="number" min="1" max="28"
              value={cfg.vencimento_dia ?? 10}
              onChange={e => setCfg({ ...cfg, vencimento_dia: Number(e.target.value) })}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Juros atraso (%/mês)</span>
            <input type="number" step="0.01" min="0" max="100"
              value={cfg.juros_atraso_pct ?? 0}
              onChange={e => setCfg({ ...cfg, juros_atraso_pct: Number(e.target.value) })}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Multa atraso (%)</span>
            <input type="number" step="0.01" min="0" max="100"
              value={cfg.multa_atraso_pct ?? 0}
              onChange={e => setCfg({ ...cfg, multa_atraso_pct: Number(e.target.value) })}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
        </div>

        <button onClick={salvar} disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50 mt-3">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar configuração"}
        </button>
      </section>
    </div>
  );
}
