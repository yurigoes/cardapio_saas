"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, Package, CreditCard,
  BarChart3, Settings, LogOut, ChefHat, Bell, Shield, FileText, Webhook, Image as ImageIcon,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin",           label: "Dashboard",  icon: LayoutDashboard },
  { href: "/admin/empresas",  label: "Empresas",   icon: Building2 },
  { href: "/admin/planos",    label: "Planos",     icon: Package },
  { href: "/admin/usuarios",  label: "Usuários",   icon: Users },
  { href: "/admin/financeiro",label: "Financeiro", icon: CreditCard },
  { href: "/admin/relatorios",label: "Relatórios", icon: BarChart3 },
  { href: "/admin/webhooks",  label: "Webhooks",   icon: Webhook },
  { href: "/admin/imagens",   label: "Imagens",    icon: ImageIcon },
  { href: "/admin/auditoria", label: "Auditoria",  icon: Shield },
  { href: "/admin/logs",      label: "Logs",       icon: FileText },
  { href: "/admin/config",    label: "Config",     icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname     = usePathname();
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
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-white/5 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
            <ChefHat className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold">Cardápio SaaS</p>
            <p className="text-[10px] text-emerald-400 uppercase tracking-wider">Master Admin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-auto py-4">
          {NAV_ITEMS.map((item) => {
            const Icon    = item.icon;
            const active  = pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 mx-3 mb-0.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
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
