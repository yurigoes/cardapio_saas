"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, Package, CreditCard,
  BarChart3, Settings, LogOut, ChefHat, Bell, Shield, FileText, Webhook,
  Image as ImageIcon, TrendingUp, Bug, Server, AlertTriangle, ScrollText,
  Mail, ShieldCheck, Wrench, Receipt, Zap, LifeBuoy,
} from "lucide-react";
import { VersaoFooter } from "@/components/VersaoFooter";
import { useSaasBranding } from "@/lib/hooks/useSaasBranding";

type NavItem  = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { titulo?: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { items: [
    { href: "/admin",           label: "Dashboard",  icon: LayoutDashboard },
  ]},
  { titulo: "Negócio", items: [
    { href: "/admin/empresas",  label: "Empresas",   icon: Building2 },
    { href: "/admin/usuarios",  label: "Usuários",   icon: Users },
    { href: "/admin/planos",    label: "Planos",     icon: Package },
    { href: "/admin/financeiro",label: "Financeiro", icon: CreditCard },
    { href: "/admin/financeiro/mensalidades", label: "Mensalidades", icon: Receipt },
    { href: "/admin/billing",   label: "Mercado Pago", icon: CreditCard },
    { href: "/admin/relatorios",label: "Relatórios", icon: BarChart3 },
    { href: "/admin/metricas",  label: "Métricas",   icon: TrendingUp },
  ]},
  { titulo: "Servidor", items: [
    { href: "/admin/vps",      label: "VPS",          icon: Server },
    { href: "/admin/maquinas", label: "Máquinas",     icon: Server },
    { href: "/admin/erros",    label: "Erros",        icon: AlertTriangle },
    { href: "/admin/auditoria", label: "Auditoria",   icon: ScrollText },
    { href: "/admin/observability", label: "Observability", icon: Bug },
    { href: "/admin/logs",     label: "Logs",         icon: FileText },
  ]},
  { titulo: "Conteúdo", items: [
    { href: "/admin/imagens",   label: "Imagens",     icon: ImageIcon },
    { href: "/admin/webhooks",  label: "Webhooks",    icon: Webhook },
  ]},
  { titulo: "Integrações", items: [
    { href: "/admin/ifood",     label: "iFood (master)", icon: Zap },
  ]},
  { titulo: "Atendimento", items: [
    { href: "/admin/suporte",   label: "Acessos Suporte", icon: LifeBuoy },
  ]},
  { titulo: "Sistema", items: [
    { href: "/admin/email",      label: "E-mail (SMTP)", icon: Mail },
    { href: "/admin/manutencao", label: "Manutenção",    icon: Wrench },
    { href: "/admin/seguranca",  label: "Segurança 2FA", icon: ShieldCheck },
    { href: "/admin/config",     label: "Configurações", icon: Settings },
  ]},
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname     = usePathname();
  const branding     = useSaasBranding();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verifica autenticação e role master
    const token = localStorage.getItem("access_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success || data.data?.usuario?.role !== "master") {
          window.location.href = "/login";
        } else {
          setLoading(false);
        }
      })
      .catch(() => (window.location.href = "/login"));
  }, []);

  function handleLogout() {
    const token = localStorage.getItem("access_token");
    fetch("/api/auth/logout", {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).finally(() => {
      localStorage.clear();
      window.location.href = "/login";
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-white/5 bg-slate-900">
        {/* Logo — absoluta quando há logo_url */}
        <div className="flex h-16 items-center gap-3 border-b border-white/5 px-6">
          {branding.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logo_url}
              alt={branding.nome}
              className="h-9 w-auto max-w-[140px] object-contain"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
              <ChefHat className="h-4 w-4 text-emerald-400" />
            </div>
          )}
          <div className="min-w-0">
            {!branding.logo_url && (
              <p className="text-sm font-semibold truncate">{branding.nome}</p>
            )}
            <p className="text-[10px] text-emerald-400 uppercase tracking-wider">Master Admin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-auto py-3">
          {NAV.map((grupo, gi) => (
            <div key={gi} className="mb-3">
              {grupo.titulo && (
                <p className="px-5 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {grupo.titulo}
                </p>
              )}
              {grupo.items.map((item) => {
                const Icon    = item.icon;
                const active  = pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 mx-3 mb-0.5 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                      active
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/5 p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
        <VersaoFooter mostrarVps />
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-white/5 bg-slate-950/80 px-8 backdrop-blur">
          <h1 className="text-sm font-medium text-slate-300">
            Painel Administrativo Master
          </h1>
          <button className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 hover:border-white/20 transition">
            <Bell className="h-4 w-4 text-slate-400" />
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
