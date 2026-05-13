"use client";

/**
 * /painel — Dashboard cockpit
 *
 * Consolida em uma tela:
 *   - Pulso de saúde do sistema (banner clicável)
 *   - Alertas acionáveis (caixa, estoque, gateways, pendentes)
 *   - 6 KPIs do dia
 *   - Pedidos pendentes (precisam de ação)
 *   - Atalhos rápidos
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShoppingBag, DollarSign, TrendingUp, Users, Clock, CheckCircle,
  Wallet, Package, CreditCard, MessageCircle, Activity,
  AlertTriangle, ChevronRight, Eye, ChefHat, Tv2,
} from "lucide-react";
import { TrialBanner } from "@/components/painel/TrialBanner";
import { OnboardingBanner } from "@/components/painel/OnboardingBanner";
import { ImpersonateBanner } from "@/components/painel/ImpersonateBanner";
import { LinksExternos } from "@/components/painel/LinksExternos";

interface Stats {
  pedidos_hoje:      number;
  pedidos_pendentes: number;
  vendas_hoje:       number;
  ticket_medio:      number;
  clientes_novos:    number;
  tempo_medio_min:   number;
}

interface PedidoRecente {
  id: string; numero: number; tipo: string; status: string;
  total: number; cliente_nome: string | null; created_at: string;
}

interface HealthCheck {
  status: "ok" | "warning" | "error" | "disabled";
  message: string;
}
interface Health {
  overall: "ok" | "warning" | "error";
  checks: {
    db: HealthCheck; gateways: HealthCheck; evolution: HealthCheck;
    caixa: HealthCheck; estoque: HealthCheck; pedidos: HealthCheck;
  };
}

const STATUS_LABEL: Record<string, string> = {
  pendente:   "Pendente",   confirmado: "Confirmado",
  preparando: "Preparando", pronto:     "Pronto",
  entregue:   "Entregue",   cancelado:  "Cancelado",
};
const STATUS_COLOR: Record<string, string> = {
  pendente:   "bg-amber-500/15 text-amber-400",
  confirmado: "bg-blue-500/15 text-blue-400",
  preparando: "bg-violet-500/15 text-violet-400",
  pronto:     "bg-brand/15 text-brand",
  entregue:   "bg-slate-500/15 text-slate-400",
  cancelado:  "bg-red-500/15 text-red-400",
};
const TIPO_LABEL: Record<string, string> = {
  mesa: "Mesa", balcao: "Balcão", delivery: "Delivery",
  totem: "Totem", whatsapp: "WhatsApp", app: "App",
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function PainelDashboard() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRecente[]>([]);
  const [health, setHealth]   = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    const h = { Authorization: `Bearer ${token}` };
    const [s, p, hth] = await Promise.all([
      fetch("/api/painel/stats", { headers: h }).then(r => r.json()).catch(() => null),
      fetch("/api/pedidos?limit=8&page=1&status=pendente", { headers: h }).then(r => r.json()).catch(() => null),
      fetch("/api/painel/health", { headers: h }).then(r => r.json()).catch(() => null),
    ]);
    if (s?.success)   setStats(s.data);
    if (p?.success)   setPedidos(p.data);
    if (hth?.success) setHealth(hth.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  // Auto-refresh a cada 60s
  useEffect(() => {
    const id = setInterval(fetchAll, 60_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  // ── Alertas acionáveis (derivados do health) ──────────────────────────────
  const alertas: Array<{ icon: React.ElementType; label: string; href: string; color: string; descricao: string }> = [];
  if (health?.checks.caixa.status === "warning") {
    alertas.push({
      icon: Wallet, label: "Caixa", href: "/painel/caixa",
      color: "amber", descricao: health.checks.caixa.message,
    });
  }
  if (health?.checks.estoque.status === "warning") {
    alertas.push({
      icon: Package, label: "Estoque", href: "/painel/estoque",
      color: "amber", descricao: health.checks.estoque.message,
    });
  }
  if (health?.checks.gateways.status === "warning" || health?.checks.gateways.status === "disabled") {
    alertas.push({
      icon: CreditCard, label: "Gateways", href: "/painel/gateways",
      color: health.checks.gateways.status === "disabled" ? "slate" : "amber",
      descricao: health.checks.gateways.message,
    });
  }
  if (health?.checks.evolution.status === "warning" || health?.checks.evolution.status === "error") {
    alertas.push({
      icon: MessageCircle, label: "WhatsApp", href: "/painel/integracoes",
      color: health.checks.evolution.status === "error" ? "red" : "amber",
      descricao: health.checks.evolution.message,
    });
  }

  const overallCfg =
    health?.overall === "error"   ? { bg: "bg-red-500/10",   border: "border-red-500/30",   text: "text-red-400",   label: "Falha detectada" } :
    health?.overall === "warning" ? { bg: "bg-amber-500/10", border: "border-amber-400/30", text: "text-amber-300", label: "Atenção necessária" } :
                                    { bg: "bg-brand/10",     border: "border-brand/30",     text: "text-brand",     label: "Tudo operacional" };

  return (
    <div className="space-y-5 pb-12">
      {/* Master operando como esta empresa */}
      <ImpersonateBanner />

      {/* Trial */}
      <TrialBanner />

      {/* Onboarding */}
      <OnboardingBanner />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="mt-0.5 text-sm text-slate-400">
          {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Banner de saúde */}
      {health && (
        <Link
          href="/painel/saude"
          className={`flex items-center gap-3 rounded-2xl border p-4 transition hover:brightness-110 ${overallCfg.bg} ${overallCfg.border}`}
        >
          <Activity className={`h-5 w-5 flex-shrink-0 ${overallCfg.text}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${overallCfg.text}`}>{overallCfg.label}</p>
            <p className="text-xs text-slate-400 truncate">
              {Object.values(health.checks).filter(c => c.status === "ok").length} de {Object.keys(health.checks).length} componentes OK
            </p>
          </div>
          <ChevronRight className={`h-4 w-4 ${overallCfg.text}`} />
        </Link>
      )}

      {/* Alertas acionáveis */}
      {alertas.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {alertas.map((a) => {
            const Icon = a.icon;
            const cls = a.color === "red"   ? "border-red-500/30 bg-red-500/5 text-red-300" :
                        a.color === "amber" ? "border-amber-400/30 bg-amber-500/5 text-amber-300" :
                                              "border-white/10 bg-white/5 text-slate-400";
            return (
              <Link key={a.label} href={a.href} className={`flex items-start gap-2 rounded-xl border p-3 transition hover:brightness-110 ${cls}`}>
                <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-bold">{a.label}</p>
                  <p className="text-[10px] opacity-80 truncate">{a.descricao}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Atalhos rápidos */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
        {[
          { label: "Pedidos",    icon: ShoppingBag, href: "/painel/pedidos"  },
          { label: "Cozinha",    icon: ChefHat,     href: "/painel/cozinha"  },
          { label: "Caixa",      icon: Wallet,      href: "/painel/caixa"    },
          { label: "Estoque",    icon: Package,     href: "/painel/estoque"  },
          { label: "Mesas",      icon: Eye,         href: "/painel/mesas"    },
          { label: "Clientes",   icon: Users,       href: "/painel/clientes" },
          { label: "Painel TV",  icon: Tv2,         href: "/painel/painel-tv" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-xs font-medium text-slate-300 hover:bg-white/10 transition"
            >
              <Icon className="h-4 w-4 text-slate-400" />
              {s.label}
            </Link>
          );
        })}
      </div>

      {/* KPIs do dia */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi icon={ShoppingBag} label="Pedidos hoje"  value={String(stats.pedidos_hoje)}        color="text-blue-400" />
          <Kpi icon={Clock}        label="Pendentes"     value={String(stats.pedidos_pendentes)}    color="text-amber-400" />
          <Kpi icon={DollarSign}   label="Vendas hoje"   value={fmtBRL(stats.vendas_hoje)}          color="text-brand"     hero />
          <Kpi icon={TrendingUp}   label="Ticket médio"  value={fmtBRL(stats.ticket_medio)}         color="text-violet-400" />
          <Kpi icon={Users}        label="Clientes novos" value={String(stats.clientes_novos)}      color="text-pink-400" />
          <Kpi icon={CheckCircle}  label="Tempo médio"   value={`${stats.tempo_medio_min} min`}     color="text-cyan-400" />
        </div>
      )}

      {/* Pedidos pendentes */}
      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            {pedidos.length > 0 && <AlertTriangle className="h-4 w-4 text-amber-400" />}
            Pedidos pendentes ({pedidos.length})
          </h2>
          <Link href="/painel/pedidos" className="text-xs text-brand hover:underline">
            Ver todos
          </Link>
        </div>

        {pedidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-500">
            <CheckCircle className="h-6 w-6 text-brand opacity-60" />
            <p className="text-xs">Nenhum pedido aguardando</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {pedidos.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-white/5 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono text-slate-500">#{p.numero}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {p.cliente_nome ?? "Anônimo"}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {TIPO_LABEL[p.tipo] ?? p.tipo} · {new Date(p.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_COLOR[p.status] ?? "bg-slate-500/15 text-slate-400"}`}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  <span className="text-sm font-bold text-white">{fmtBRL(p.total)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Links externos do sistema */}
      <LinksExternos />
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, color, hero,
}: {
  icon:  React.ElementType;
  label: string;
  value: string;
  color: string;
  hero?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-4 ${hero ? "lg:col-span-1" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default PainelDashboard;
