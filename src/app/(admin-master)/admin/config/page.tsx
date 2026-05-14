"use client";

import { useEffect, useState } from "react";
import { Settings, Server, MessageCircle, Database, GitBranch, Shield, ExternalLink, Zap, Save, Loader2, ImageIcon } from "lucide-react";
import { invalidarSaasBrandingCache } from "@/lib/hooks/useSaasBranding";

interface SaasBranding {
  nome: string; logo_url: string | null;
  email: string | null; telefone: string | null;
  whatsapp: string | null; site: string | null;
}

const ATALHOS = [
  {
    titulo: "Painel da VPS",
    descricao: "Comandos remotos (status, disco, docker, deploy, logs) sem SSH",
    href: "/admin/vps",
    icon: Server, cor: "text-emerald-400",
  },
  {
    titulo: "Logs do sistema (erros)",
    descricao: "error_log com filtros + copiar pra suporte",
    href: "/admin/erros",
    icon: Shield, cor: "text-amber-400",
  },
  {
    titulo: "Auditoria",
    descricao: "Log de ações sensíveis (criar/editar/excluir/login)",
    href: "/admin/auditoria",
    icon: Shield, cor: "text-blue-400",
  },
  {
    titulo: "Empresas",
    descricao: "Gerenciar todas — reset senha, suspender, zerar, impersonar",
    href: "/admin/empresas",
    icon: Database, cor: "text-purple-400",
  },
  {
    titulo: "Planos",
    descricao: "CRUD de planos com proteção de inativação",
    href: "/admin/planos",
    icon: GitBranch, cor: "text-pink-400",
  },
];

const ENVS_CRITICAS = [
  { nome: "DATABASE_URL",       descricao: "PostgreSQL principal" },
  { nome: "REDIS_PASSWORD",     descricao: "Cache + sessões" },
  { nome: "JWT_SECRET",         descricao: "Assina access tokens" },
  { nome: "JWT_REFRESH_SECRET", descricao: "Assina refresh tokens" },
  { nome: "ENCRYPTION_KEY",     descricao: "Cifra secrets (AES-256)" },
  { nome: "MASTER_PASSWORD",    descricao: "Senha master inicial" },
  { nome: "EVOLUTION_API_KEY",  descricao: "Acesso à Evolution WhatsApp" },
  { nome: "MERCADOPAGO_ACCESS_TOKEN", descricao: "Cobranças (módulos)" },
  { nome: "CRON_SECRET",        descricao: "Auth dos crons noturnos" },
  { nome: "GITHUB_WEBHOOK_SECRET", descricao: "Auto-deploy webhook" },
];

export default function AdminConfigPage() {
  const [branding, setBranding] = useState<SaasBranding | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("access_token") ?? "";
    fetch("/api/admin/saas-branding", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setBranding(d.data); })
      .catch(() => {});
  }, []);

  async function salvarBranding(e: React.FormEvent) {
    e.preventDefault();
    if (!branding) return;
    setSalvando(true); setMsg(null);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch("/api/admin/saas-branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify(branding),
      });
      const d = await r.json();
      if (d.success) {
        setBranding(d.data);
        invalidarSaasBrandingCache(); // força refetch nas próximas páginas
        setMsg("✓ Salvo. Recarregue (F5) outras abas pra ver a nova logo.");
      }
      else setMsg(d.error?.message ?? "Falha");
    } finally {
      setSalvando(false);
      setTimeout(() => setMsg(null), 5000);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Settings className="h-5 w-5 text-emerald-400" /> Configurações master
          </h1>
          <p className="text-sm text-slate-400">Branding do SaaS, atalhos pras áreas administrativas + estado das envs</p>
        </div>

        {/* Branding do SaaS */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> Identidade do SaaS (dono)
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Esses dados aparecem no header dos painéis das empresas (no formato Logo SaaS | Logo Empresa).
            Páginas públicas (cardápio, totem) mostram só a logo da empresa.
          </p>
          {!branding ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : (
            <form onSubmit={salvarBranding} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Nome da plataforma">
                  <input value={branding.nome ?? ""} onChange={e => setBranding({ ...branding, nome: e.target.value })}
                    required className="input" />
                </Field>
                <Field label="Logo URL (use /api/upload pra subir)">
                  <input value={branding.logo_url ?? ""} onChange={e => setBranding({ ...branding, logo_url: e.target.value || null })}
                    placeholder="https://..." className="input" />
                </Field>
                <Field label="E-mail comercial">
                  <input type="email" value={branding.email ?? ""} onChange={e => setBranding({ ...branding, email: e.target.value || null })}
                    placeholder="contato@..." className="input" />
                </Field>
                <Field label="Telefone">
                  <input value={branding.telefone ?? ""} onChange={e => setBranding({ ...branding, telefone: e.target.value || null })}
                    placeholder="(71) 99999-9999" className="input" />
                </Field>
                <Field label="WhatsApp (público)">
                  <input value={branding.whatsapp ?? ""} onChange={e => setBranding({ ...branding, whatsapp: e.target.value || null })}
                    placeholder="71999999999" className="input" />
                </Field>
                <Field label="Site">
                  <input value={branding.site ?? ""} onChange={e => setBranding({ ...branding, site: e.target.value || null })}
                    placeholder="https://..." className="input" />
                </Field>
              </div>
              {branding.logo_url && (
                <div className="rounded-lg bg-slate-900/50 p-3 flex items-center gap-3">
                  <span className="text-xs text-slate-500">Preview:</span>
                  <img src={branding.logo_url} alt="" className="max-h-12 object-contain" />
                </div>
              )}
              {msg && <p className={`text-sm ${msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}
              <button type="submit" disabled={salvando}
                className="rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 px-5 py-2 text-sm font-bold text-white inline-flex items-center gap-2">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar identidade
              </button>
            </form>
          )}
        </section>

        {/* Atalhos */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Áreas administrativas</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {ATALHOS.map(a => {
              const Icon = a.icon;
              return (
                <a key={a.href} href={a.href}
                  className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 p-4 flex items-start gap-3 transition">
                  <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${a.cor}`} />
                  <div className="flex-1">
                    <p className="font-bold text-white text-sm">{a.titulo}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{a.descricao}</p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-slate-500" />
                </a>
              );
            })}
          </div>
        </section>

        {/* Envs */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
            Variáveis de ambiente críticas
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Editar via SSH em <code>/opt/cardapio_saas/.env</code> + recriar o container.
            Nunca exposto na UI por segurança.
          </p>
          <div className="space-y-1">
            {ENVS_CRITICAS.map(e => (
              <div key={e.nome} className="flex items-center justify-between py-1.5 text-xs">
                <code className="text-emerald-300">{e.nome}</code>
                <span className="text-slate-400">{e.descricao}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-3">
            Para configurar, veja <a href="https://github.com/yurigoes/cardapio_saas/blob/main/scripts/producao-checklist.md"
              target="_blank" className="text-emerald-400 underline">scripts/producao-checklist.md</a>.
          </p>
        </section>

        {/* Integrações status (placeholder — pode evoluir pra ping real) */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Integrações
          </h2>
          <Item icon={MessageCircle} cor="text-green-400" titulo="Evolution (WhatsApp)" url="https://evolution.tthreedigital.com.br/manager" />
          <Item icon={Zap}            cor="text-pink-400"  titulo="n8n Automações"      url="https://n8n.tthreedigital.com.br" />
          <Item icon={Database}       cor="text-amber-400" titulo="MinIO Storage"        url="https://minio-console.tthreedigital.com.br" />
        </section>
      </div>);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-400 mb-1 block">{label}</span>
      {children}
      <style jsx>{`
        :global(.input) {
          width: 100%;
          background: rgb(30 41 59);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          color: white;
          font-size: 0.875rem;
        }
        :global(.input:focus) {
          outline: none;
          border-color: rgba(16,185,129,0.5);
        }
      `}</style>
    </label>
  );
}

function Item({ icon: Icon, cor, titulo, url }: { icon: React.ComponentType<{ className?: string }>; cor: string; titulo: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 py-2 hover:bg-white/5 rounded-lg px-2 -mx-2 group">
      <Icon className={`h-4 w-4 ${cor}`} />
      <span className="flex-1 text-sm text-white">{titulo}</span>
      <span className="text-xs text-slate-500 group-hover:text-slate-300 truncate">{url}</span>
      <ExternalLink className="h-3 w-3 text-slate-500" />
    </a>
  );
}
