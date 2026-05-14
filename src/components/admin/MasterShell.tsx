"use client";

/**
 * Shell pras páginas do MASTER (/admin/vps, /admin/erros, etc).
 * Sidebar com navegação agrupada por categoria.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Server, AlertTriangle, Building2, LayoutDashboard,
  LogOut, Shield, GitBranch, Users, DollarSign, BarChart3,
  ScrollText, Settings, Activity,
} from "lucide-react";

type NavItem  = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { titulo?: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    items: [
      { href: "/admin",          label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    titulo: "Negócio",
    items: [
      { href: "/admin/empresas", label: "Empresas",  icon: Building2 },
      { href: "/admin/usuarios", label: "Usuários",  icon: Users },
      { href: "/admin/planos",   label: "Planos",    icon: GitBranch },
      { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign },
      { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    titulo: "Servidor",
    items: [
      { href: "/admin/vps",      label: "VPS",       icon: Server },
      { href: "/admin/erros",    label: "Erros",     icon: AlertTriangle },
      { href: "/admin/auditoria", label: "Auditoria", icon: ScrollText },
      { href: "/admin/observability", label: "Observability", icon: Activity },
    ],
  },
  {
    titulo: "Sistema",
    items: [
      { href: "/admin/config",   label: "Configurações", icon: Settings },
    ],
  },
];

export default function MasterShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [user, setUser] = useState<{ nome?: string; email?: string; role?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("access_token");
    if (!t) { router.push("/login"); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => {
        if (!d.success) { router.push("/login"); return; }
        const u = d.data?.usuario;
        if (u?.role !== "master") {
          router.push("/painel");
          return;
        }
        setUser(u);
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  function logout() {
    const t = localStorage.getItem("access_token");
    fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${t}` } })
      .finally(() => { localStorage.clear(); router.push("/login"); });
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
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-white/5 bg-slate-900">
        <div className="flex h-16 items-center gap-3 border-b border-white/5 px-4">
          <div className="rounded-lg bg-amber-500/15 p-2">
            <Shield className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">Master</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-auto py-3">
          {NAV.map((grupo, gi) => (
            <div key={gi} className="mb-3">
              {grupo.titulo && (
                <p className="px-4 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {grupo.titulo}
                </p>
              )}
              {grupo.items.map(item => {
                const Icon = item.icon;
                const active = pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 mx-2 mb-0.5 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
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

        <div className="border-t border-white/5 p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <div className="flex-1 pl-60">
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
