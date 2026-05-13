"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Bike, DollarSign,
  Package, Users, Settings, LogOut, ChefHat, Bell, Tag, BarChart3,
  MapPin, CreditCard, Zap, LayoutGrid, Tv2, Wallet, Activity, ScrollText,
  Receipt, Sun, Moon, Database, Key, Printer,
} from "lucide-react";
import { applyBrandColors } from "@/lib/theme";
import { useTheme } from "@/lib/hooks/useTheme";
import { PwaInstallPrompt } from "@/components/painel/PwaInstallPrompt";
import { PrintAgentStatus } from "@/components/painel/PrintAgentStatus";

interface Empresa {
  nome_fantasia:  string;
  logo_url:       string | null;
  modulos_ativos: string[];
  cor_primaria:   string | null;
  cor_secundaria: string | null;
}

const ALL_NAV = [
  { href: "/hub",                label: "Módulos",     icon: LayoutGrid,      modulo: null         },
  { href: "/painel",             label: "Dashboard",   icon: LayoutDashboard, modulo: null         },
  { href: "/painel/pedidos",     label: "Pedidos",     icon: ShoppingBag,     modulo: null         },
  { href: "/painel/pdv",         label: "PDV / Balcão", icon: Wallet,         modulo: "balcao"     },
  { href: "/painel/cardapio",    label: "Cardápio",    icon: UtensilsCrossed, modulo: null         },
  { href: "/painel/mesas",       label: "Mesas",       icon: MapPin,          modulo: "mesa"       },
  { href: "/painel/delivery",    label: "Delivery",    icon: Bike,            modulo: "delivery"   },
  { href: "/painel/cozinha",     label: "Cozinha",     icon: ChefHat,         modulo: "cozinha_kds"},
  { href: "/painel/painel-tv",  label: "Painel TV",   icon: Tv2,             modulo: "cozinha_kds"},
  { href: "/painel/caixa",       label: "Caixa",       icon: Wallet,          modulo: "financeiro" },
  { href: "/painel/financeiro",  label: "Financeiro",  icon: DollarSign,      modulo: "financeiro" },
  { href: "/painel/estoque",     label: "Estoque",     icon: Package,         modulo: "estoque"    },
  { href: "/painel/cupons",      label: "Cupons",      icon: Tag,             modulo: "cupom"      },
  { href: "/painel/clientes",    label: "Clientes",    icon: Users,           modulo: "crm"        },
  { href: "/painel/vales",       label: "Vales",       icon: Wallet,          modulo: "crm"        },
  { href: "/painel/relatorios",  label: "Relatórios",  icon: BarChart3,       modulo: "relatorios_basicos" },
  { href: "/painel/gateways",    label: "Gateways",    icon: CreditCard,      modulo: null         },
  { href: "/painel/pagamentos",  label: "Cobranças",   icon: Receipt,         modulo: null         },
  { href: "/painel/integracoes", label: "Integrações", icon: Zap,             modulo: null         },
  { href: "/painel/ifood",       label: "iFood",       icon: Zap,             modulo: "ifood"      },
  { href: "/painel/api-keys",    label: "API Keys",    icon: Key,             modulo: null         },
  { href: "/painel/impressoras", label: "Impressoras", icon: Printer,         modulo: null         },
  { href: "/painel/usuarios",    label: "Usuários",    icon: Users,           modulo: null         },
  { href: "/painel/saude",       label: "Saúde",       icon: Activity,        modulo: null         },
  { href: "/painel/auditoria",   label: "Auditoria",   icon: ScrollText,      modulo: null         },
  { href: "/painel/backup",      label: "Backup",      icon: Database,        modulo: null         },
  { href: "/painel/config",      label: "Configurações",icon: Settings,       modulo: null         },
];

export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  const pathname          = usePathname();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { window.location.href = "/login"; return; }

    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) { window.location.href = "/login"; return; }
        const role = data.data?.usuario?.role;
        if (role === "master") { window.location.href = "/admin"; return; }
        setEmpresa(data.data?.empresa);

        // Apply brand colors as CSS variables (incl. --color-primary-rgb p/ Tailwind brand)
        applyBrandColors({
          primary:   data.data?.empresa?.cor_primaria,
          secondary: data.data?.empresa?.cor_secundaria,
        });

        setLoading(false);
      })
      .catch(() => (window.location.href = "/login"));
  }, []);

  function handleLogout() {
    const token = localStorage.getItem("access_token");
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).finally(() => { localStorage.clear(); window.location.href = "/login"; });
  }

  const modulos = empresa?.modulos_ativos ?? [];

  const navItems = ALL_NAV.filter(
    (item) => item.modulo === null || modulos.includes(item.modulo)
  );

  // Injeta manifest do PWA admin no head (só dentro de /painel)
  // ATENÇÃO: hook DEVE ficar antes de qualquer early return (regras de hooks)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const linkId = "pwa-admin-manifest";
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id   = linkId;
      link.rel  = "manifest";
      link.href = "/manifest-admin.json";
      document.head.appendChild(link);
    }
    const metaId = "pwa-theme-color";
    if (!document.getElementById(metaId)) {
      const meta = document.createElement("meta");
      meta.id      = metaId;
      meta.name    = "theme-color";
      meta.content = "#10b981";
      document.head.appendChild(meta);
    }
    // Service Worker (necessário pra installable)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration("/sw-admin.js").then(reg => {
        if (!reg) navigator.serviceWorker.register("/sw-admin.js", { scope: "/painel" }).catch(() => {});
      });
    }
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{
            borderColor:    "var(--color-primary, #10b981)",
            borderTopColor: "transparent",
          }}
        />
      </div>
    );
  }

  // PDV é full-screen — sem sidebar visível
  const fullScreenRoutes = ["/painel/pdv"];
  if (fullScreenRoutes.some(r => pathname.startsWith(r))) {
    return <>{children}<PwaInstallPrompt /></>;
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-white/5 bg-slate-900">
        {/* Logo da empresa */}
        <div className="flex h-16 items-center gap-3 border-b border-white/5 px-4">
          {empresa?.logo_url ? (
            <img src={empresa.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: "var(--color-primary-15, rgba(16,185,129,0.12))" }}
            >
              <ChefHat
                className="h-4 w-4"
                style={{ color: "var(--color-primary, #10b981)" }}
              />
            </div>
          )}
          <p className="truncate text-sm font-semibold">
            {empresa?.nome_fantasia || "Empresa"}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-auto py-3">
          {navItems.map((item) => {
            const Icon   = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 mx-2 mb-0.5 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                  active ? "" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
                style={active ? {
                  background: "var(--color-primary-15, rgba(16,185,129,0.12))",
                  color:      "var(--color-primary, #10b981)",
                } : undefined}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/5 p-3 space-y-1">
          <button
            onClick={theme.toggle}
            title={theme.isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            {theme.isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme.isDark ? "Tema claro" : "Tema escuro"}
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col pl-60">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-white/5 bg-slate-950/80 px-6 backdrop-blur">
          <div className="flex items-center gap-2">
            {empresa?.logo_url ? (
              <img src={empresa.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : null}
            <span className="text-sm font-semibold text-white hidden sm:block">
              {empresa?.nome_fantasia}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PrintAgentStatus />
            <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 hover:border-white/20 transition">
              <Bell className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
      <PwaInstallPrompt />
    </div>
  );
}
