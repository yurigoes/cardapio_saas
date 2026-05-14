"use client";

import MasterShell from "@/components/admin/MasterShell";
import { Settings, Server, MessageCircle, Database, GitBranch, Shield, ExternalLink, Zap } from "lucide-react";

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
  return (
    <MasterShell>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Settings className="h-5 w-5 text-emerald-400" /> Configurações master
          </h1>
          <p className="text-sm text-slate-400">Atalhos pras áreas administrativas + estado das envs</p>
        </div>

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
      </div>
    </MasterShell>
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
