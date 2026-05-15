"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Bike, DollarSign,
  Package, Users, Settings, LogOut, ChefHat, Bell, Tag, BarChart3,
  MapPin, CreditCard, Zap, LayoutGrid, Tv2, Wallet, Activity, ScrollText,
  Receipt, Sun, Moon, Database, Key, Printer, ShieldCheck, Mail,
} from "lucide-react";
import { applyBrandColors } from "@/lib/theme";
import { useTheme } from "@/lib/hooks/useTheme";
import { PwaInstallPrompt } from "@/components/painel/PwaInstallPrompt";
import { PrintAgentStatus } from "@/components/painel/PrintAgentStatus";
import { useSaasBranding } from "@/lib/hooks/useSaasBranding";
import { ModuloLockedModal } from "@/components/painel/ModuloLockedModal";
import { useModulos, type ModuloStatus } from "@/lib/hooks/useModulos";
import { Lock } from "lucide-react";
import { VersaoFooter } from "@/components/VersaoFooter";
import { IfoodPendingPopup } from "@/components/IfoodPendingPopup";

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
  { href: "/painel/kiosk",      label: "Painéis kiosk", icon: Tv2,           modulo: null         },
  { href: "/painel/caixa",       label: "Caixa",       icon: Wallet,          modulo: "financeiro" },
  { href: "/painel/financeiro",  label: "Financeiro",  icon: DollarSign,      modulo: "financeiro" },
  { href: "/painel/financeiro/mensalidades", label: "Mensalidades", icon: DollarSign, modulo: null },
  { href: "/painel/estoque",     label: "Estoque",     icon: Package,         modulo: "estoque"    },
  { href: "/painel/cupons",      label: "Cupons",      icon: Tag,             modulo: "cupom"      },
  { href: "/painel/clientes",    label: "Clientes",    icon: Users,           modulo: "crm"        },
  { href: "/painel/vales",       label: "Vales",       icon: Wallet,          modulo: "crm"        },
  { href: "/painel/mala-direta", label: "Mala direta", icon: Mail,            modulo: "crm"        },
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
  { href: "/painel/lgpd",        label: "Privacidade", icon: ShieldCheck,     modulo: null         },
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

  const modulosEmpresa = empresa?.modulos_ativos ?? [];
  const saasBranding = useSaasBranding();
  const { get: getModulo, recarregar: recarregarModulos } = useModulos();
  const [moduloBloqueado, setModuloBloqueado] = useState<ModuloStatus | null>(null);

  // Mostra TODOS os itens; bloqueia visualmente os que não estão no plano
  const navItems = ALL_NAV.map(item => {
    const incluso = item.modulo === null || modulosEmpresa.includes(item.modulo);
    const moduloStatus = item.modulo ? getModulo(item.modulo) : undefined;
    const ativo = incluso || (moduloStatus?.ativo ?? false);
    return { ...item, locked: !ativo, moduloStatus };
  });

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
            // Tem logo: mostra só ela (sem nome ao lado, logo já identifica)
            <img src={empresa.logo_url} alt={empresa.nome_fantasia}
              title={empresa.nome_fantasia}
              className="max-h-12 max-w-full object-contain" />
          ) : (
            // Sem logo: ícone genérico + nome
            <>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                style={{ background: "var(--color-primary-15, rgba(16,185,129,0.12))" }}
              >
                <ChefHat
                  className="h-4 w-4"
                  style={{ color: "var(--color-primary, #10b981)" }}
                />
              </div>
              <p className="truncate text-sm font-semibold">
                {empresa?.nome_fantasia || "Empresa"}
              </p>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-auto py-3">
          {navItems.map((item) => {
            const Icon   = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");

            if (item.locked) {
              return (
                <button
                  key={item.href}
                  onClick={() => setModuloBloqueado(item.moduloStatus ?? null)}
                  className="flex items-center gap-2.5 mx-2 mb-0.5 rounded-xl px-3 py-2 text-sm font-medium transition-all w-[calc(100%-1rem)] text-left text-slate-600 hover:bg-amber-500/5 hover:text-amber-300/80"
                  title="Módulo não incluso — clique para testar 7 dias ou comprar"
                >
                  <Icon className="h-4 w-4 flex-shrink-0 opacity-50" />
                  <span className="flex-1 truncate opacity-60">{item.label}</span>
                  <Lock className="h-3 w-3 flex-shrink-0 opacity-60" />
                </button>
              );
            }

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
        <VersaoFooter />
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col pl-60">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-white/5 bg-slate-950/80 px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            {/* Logo do SaaS (dono) */}
            {saasBranding.logo_url ? (
              <img src={saasBranding.logo_url} alt={saasBranding.nome}
                title={saasBranding.nome}
                className="max-h-10 max-w-[8rem] object-contain" />
            ) : (
              <span className="text-xs font-semibold text-emerald-400">{saasBranding.nome}</span>
            )}
            {/* Linha vertical separadora */}
            <span className="h-10 w-px bg-white/10" />
            {/* Logo da empresa (sem nome ao lado — a logo já identifica) */}
            {empresa?.logo_url ? (
              <img src={empresa.logo_url} alt={empresa.nome_fantasia}
                title={empresa.nome_fantasia}
                className="max-h-10 max-w-[8rem] object-contain" />
            ) : (
              <span className="text-sm font-semibold text-white">
                {empresa?.nome_fantasia}
              </span>
            )}
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
      {modulosEmpresa.includes("ifood") && <IfoodPendingPopup />}
      <ModuloLockedModal
        modulo={moduloBloqueado}
        onClose={() => setModuloBloqueado(null)}
        onSucesso={recarregarModulos}
      />
    </div>
  );
}
