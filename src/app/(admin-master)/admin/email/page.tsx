"use client";

/**
 * /admin/email — Config SMTP + teste + atalhos pra templates/logs
 */
import { useEffect, useState, useCallback } from "react";
import {
  Mail, Save, Send, CheckCircle2, AlertTriangle, Loader2,
  FileText, ScrollText, Shield, Eye, EyeOff,
} from "lucide-react";
import Link from "next/link";
import { alertar } from "@/components/ui/ConfirmModal";

interface Config {
  host: string | null; port: number; secure: boolean;
  username: string | null; password: string | null;
  from_name: string | null; from_email: string | null;
  reply_to: string | null; ativo: boolean;
  ultimo_envio: string | null; ultimo_status: string | null; ultimo_erro: string | null;
  enviados_total: number; falhas_total: number;
}

function authHeader(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

export default function AdminEmailPage() {
  const [cfg, setCfg]         = useState<Partial<Config>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [testando, setTestando] = useState(false);
  const [destino, setDestino]   = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/email/config", { headers: authHeader() });
      const d = await r.json();
      if (d.success) setCfg(d.data ?? {});
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/email/config", {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({
          host:       cfg.host ?? null,
          port:       cfg.port ?? 587,
          secure:     cfg.secure ?? false,
          username:   cfg.username ?? null,
          password:   cfg.password === "********" ? undefined : cfg.password ?? null,
          from_name:  cfg.from_name ?? null,
          from_email: cfg.from_email ?? null,
          reply_to:   cfg.reply_to ?? null,
          ativo:      cfg.ativo ?? false,
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

  async function testar() {
    if (!destino.trim()) {
      await alertar({ titulo: "Destino obrigatório", mensagem: "Informe um e-mail pra receber o teste.", tipo: "alerta" });
      return;
    }
    setTestando(true);
    try {
      const r = await fetch("/api/admin/email/testar", {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ destino: destino.trim(), evento: "boas_vindas" }),
      });
      const d = await r.json();
      await alertar({
        titulo: d.data?.sucesso ? "✓ E-mail enviado" : (d.data?.enfileirado ? "Enfileirado" : "Falha"),
        mensagem: d.data?.mensagem ?? d.error?.message ?? "?",
        tipo: d.data?.sucesso ? "sucesso" : (d.data?.enfileirado ? "info" : "perigo"),
      });
      carregar();
    } finally { setTestando(false); }
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
            <Mail className="h-5 w-5 text-emerald-400" /> E-mail (SMTP)
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Servidor SMTP do master pra disparar boas-vindas, reset senha, faturas, etc.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/email/templates"
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
            <FileText className="h-3.5 w-3.5" /> Templates
          </Link>
          <Link href="/admin/email/logs"
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
            <ScrollText className="h-3.5 w-3.5" /> Logs
          </Link>
        </div>
      </div>

      {/* Status */}
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
              {cfg.ativo ? "SMTP ativo" : "SMTP desativado"}
            </p>
            <p className="text-xs text-slate-400">
              Enviados: <strong className="text-emerald-300">{cfg.enviados_total ?? 0}</strong> ·
              Falhas: <strong className="text-red-300">{cfg.falhas_total ?? 0}</strong>
              {cfg.ultimo_envio && (
                <> · Último: {new Date(cfg.ultimo_envio).toLocaleString("pt-BR")}</>
              )}
              {cfg.ultimo_status === "erro" && cfg.ultimo_erro && (
                <span className="text-red-400"> · Erro: {cfg.ultimo_erro}</span>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Servidor SMTP
        </h2>

        <div className="grid grid-cols-3 gap-3">
          <label className="col-span-2 block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Host *</span>
            <input value={cfg.host ?? ""}
              onChange={e => setCfg({ ...cfg, host: e.target.value })}
              placeholder="smtp.gmail.com"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Porta *</span>
            <input type="number" value={cfg.port ?? 587}
              onChange={e => setCfg({ ...cfg, port: Number(e.target.value) })}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={cfg.secure ?? false}
            onChange={e => setCfg({ ...cfg, secure: e.target.checked })}
            className="accent-emerald-500" />
          <span>SSL/TLS implícito (porta 465)</span>
          <span className="text-xs text-slate-500">— deixe desmarcado pra STARTTLS (587)</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Usuário</span>
            <input value={cfg.username ?? ""}
              onChange={e => setCfg({ ...cfg, username: e.target.value })}
              placeholder="seu@email.com"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Senha</span>
            <div className="relative">
              <input type={showPwd ? "text" : "password"} value={cfg.password ?? ""}
                onChange={e => setCfg({ ...cfg, password: e.target.value })}
                placeholder="••••••••"
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 pr-10 text-sm text-white" />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
        </div>

        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mt-6">
          Identidade do remetente
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Nome de exibição</span>
            <input value={cfg.from_name ?? ""}
              onChange={e => setCfg({ ...cfg, from_name: e.target.value })}
              placeholder="Cardápio SaaS"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">From email *</span>
            <input type="email" value={cfg.from_email ?? ""}
              onChange={e => setCfg({ ...cfg, from_email: e.target.value })}
              placeholder="naoresponda@seudominio.com"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-400 mb-1 block">Reply-To (opcional)</span>
          <input type="email" value={cfg.reply_to ?? ""}
            onChange={e => setCfg({ ...cfg, reply_to: e.target.value })}
            placeholder="suporte@seudominio.com"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-300 mt-4">
          <input type="checkbox" checked={cfg.ativo ?? false}
            onChange={e => setCfg({ ...cfg, ativo: e.target.checked })}
            className="accent-emerald-500" />
          <Shield className="h-4 w-4" />
          <span>Ativar SMTP (envios automáticos passam a funcionar)</span>
        </label>

        <button onClick={salvar} disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar config"}
        </button>
      </section>

      {/* Teste */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Enviar e-mail de teste
        </h2>
        <p className="text-xs text-slate-500">
          Dispara o template &quot;boas_vindas&quot; com dados dummy pro destino. Útil pra
          conferir se o servidor está aceitando autenticação.
        </p>
        <div className="flex gap-2">
          <input type="email" value={destino} onChange={e => setDestino(e.target.value)}
            placeholder="seu@email.com"
            className="flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          <button onClick={testar} disabled={testando || !destino.trim()}
            className="flex items-center gap-2 rounded-xl bg-blue-500 hover:bg-blue-400 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {testando ? "Enviando..." : "Enviar teste"}
          </button>
        </div>
      </section>
    </div>
  );
}
