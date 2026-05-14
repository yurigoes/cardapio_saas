"use client";

/**
 * /painel/financeiro — Dashboard financeiro consolidado
 *
 * Consome /api/painel/relatorio/financeiro (agregação no servidor).
 * Mostra KPIs, breakdown por forma/tipo, gráfico de pico por hora,
 * caixas do período, top produtos e top clientes.
 *
 * Filtros de período: hoje, 7 dias, 30 dias, custom.
 */
import { useEffect, useState, useCallback } from "react";
import {
  DollarSign, TrendingUp, ShoppingBag, Users, Receipt, RefreshCw,
  Banknote, QrCode, CreditCard, Wallet, Package, Trophy, Clock,
  RotateCcw, AlertCircle, Download,
} from "lucide-react";
import { alertar } from "@/components/ui/ConfirmModal";

interface RelatorioFinanceiro {
  periodo: { from: string; to: string };
  kpis: {
    total_pedidos:    number;
    total_vendas:     number;
    ticket_medio:     number;
    total_descontos:  number;
    total_estornos:   number;
    clientes_unicos:  number;
  };
  por_forma:  { forma: string;  total: number; qtd: number }[];
  por_tipo:   { tipo:  string;  total: number; qtd: number }[];
  por_hora:   { hora:  number;  total: number; qtd: number }[];
  caixas: {
    qtd:               number;
    total_diferencas:  number;
    com_diferenca:     number;
  };
  top_produtos: { produto_id: string | null; nome: string; qtd_vendida: number; receita: number }[];
  top_clientes: { cliente_id: string; nome: string; pedidos: number; total_gasto: number }[];
}

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix:      "PIX",
  credito:  "Crédito",
  debito:   "Débito",
  outro:    "Outro",
};

const FORMA_ICON: Record<string, React.ElementType> = {
  dinheiro: Banknote,
  pix:      QrCode,
  credito:  CreditCard,
  debito:   CreditCard,
  outro:    DollarSign,
};

const TIPO_LABEL: Record<string, string> = {
  mesa:     "Mesa",
  balcao:   "Balcão",
  delivery: "Delivery",
  totem:    "Totem",
  whatsapp: "WhatsApp",
  app:      "App",
};

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader(): HeadersInit { return { Authorization: `Bearer ${getToken()}` }; }

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isoToday(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function fmtDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

type Periodo = "hoje" | "7d" | "30d" | "custom";

export default function FinanceiroPage() {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [from, setFrom] = useState<string>(isoToday());
  const [to,   setTo]   = useState<string>(isoToday());
  const [customOpen, setCustomOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const [data, setData]       = useState<RelatorioFinanceiro | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Faz download do CSV. Usa fetch com Authorization header e cria um blob URL
   * para download. Não pode usar <a href=...> direto porque a API exige JWT.
   */
  async function exportarCSV(tipo: "pedidos" | "caixa") {
    setExportOpen(false);
    try {
      const sp = new URLSearchParams({ from, to, tipo });
      const res = await fetch(`/api/painel/relatorio/financeiro/csv?${sp}`, {
        headers: authHeader(),
      });
      if (!res.ok) {
        await alertar({ titulo: "Erro ao gerar CSV", tipo: "perigo" });
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${tipo === "pedidos" ? "pedidos" : "movimentos_caixa"}_${from}_a_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[Export CSV]", e);
      await alertar({ titulo: "Erro ao baixar CSV", tipo: "perigo" });
    }
  }

  // Aplica preset de período
  function aplicarPreset(p: Periodo) {
    setPeriodo(p);
    if (p === "hoje")  { setFrom(isoToday(0));   setTo(isoToday(0)); }
    if (p === "7d")    { setFrom(isoToday(-6));  setTo(isoToday(0)); }
    if (p === "30d")   { setFrom(isoToday(-29)); setTo(isoToday(0)); }
    if (p === "custom") setCustomOpen(true);
  }

  const fetchRelatorio = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ from, to });
      const res  = await fetch(`/api/painel/relatorio/financeiro?${sp}`, {
        headers: authHeader(),
      });
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchRelatorio(); }, [fetchRelatorio]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
        <AlertCircle className="h-10 w-10 opacity-30" />
        <p className="text-sm">Não foi possível carregar o relatório</p>
      </div>
    );
  }

  // Pico do gráfico de horas (para normalizar barras)
  const maxHora = Math.max(1, ...data.por_hora.map((h) => h.total));

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <TrendingUp className="h-6 w-6 text-brand" />
            Relatório Financeiro
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {fmtDateBR(data.periodo.from)} a {fmtDateBR(data.periodo.to)}
            {data.kpis.total_pedidos > 0 && ` · ${data.kpis.total_pedidos} pedidos`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRelatorio}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>

          {/* Dropdown de exportação */}
          <div className="relative">
            <button
              onClick={() => setExportOpen(o => !o)}
              className="flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white hover:brightness-110 transition"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 w-56 rounded-xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
                  <button
                    onClick={() => exportarCSV("pedidos")}
                    className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-white/5 transition"
                  >
                    <Receipt className="h-4 w-4 mt-0.5 text-brand" />
                    <div>
                      <p className="text-sm font-semibold text-white">Pedidos</p>
                      <p className="text-[11px] text-slate-400">1 linha por pedido — ideal para conciliação</p>
                    </div>
                  </button>
                  <button
                    onClick={() => exportarCSV("caixa")}
                    className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-white/5 transition border-t border-white/5"
                  >
                    <Wallet className="h-4 w-4 mt-0.5 text-brand" />
                    <div>
                      <p className="text-sm font-semibold text-white">Movimentos de Caixa</p>
                      <p className="text-[11px] text-slate-400">Vendas, sangrias, reforços, estornos</p>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filtros de período */}
      <div className="flex flex-wrap items-center gap-2">
        {([["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["custom", "Período"]] as const).map(([key, label]) => {
          const active = periodo === key;
          return (
            <button
              key={key}
              onClick={() => aplicarPreset(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "bg-brand/15 text-brand"
                  : "border border-white/10 text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          );
        })}

        {periodo === "custom" && customOpen && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white focus:border-brand/50 focus:outline-none"
            />
            <span className="text-xs text-slate-500">até</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white focus:border-brand/50 focus:outline-none"
            />
            <button
              onClick={fetchRelatorio}
              className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-white hover:brightness-110 transition"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={DollarSign} label="Vendas"        value={fmtBRL(data.kpis.total_vendas)}  color="text-brand"      hero />
        <KpiCard icon={ShoppingBag} label="Pedidos"       value={String(data.kpis.total_pedidos)} color="text-blue-400"  />
        <KpiCard icon={Receipt}    label="Ticket médio"  value={fmtBRL(data.kpis.ticket_medio)}  color="text-violet-400" />
        <KpiCard icon={Users}      label="Clientes"      value={String(data.kpis.clientes_unicos)} color="text-amber-400" />
        <KpiCard icon={RotateCcw}  label="Estornos"      value={fmtBRL(data.kpis.total_estornos)} color="text-red-400" />
        <KpiCard icon={DollarSign} label="Descontos"     value={fmtBRL(data.kpis.total_descontos)} color="text-orange-400" />
        <KpiCard
          icon={Wallet}
          label="Caixas fechados"
          value={String(data.caixas.qtd)}
          color="text-slate-300"
          subtitle={data.caixas.com_diferenca > 0
            ? `${data.caixas.com_diferenca} com diferença`
            : "todos OK"}
        />
        <KpiCard
          icon={AlertCircle}
          label="Diferenças de caixa"
          value={fmtBRL(data.caixas.total_diferencas)}
          color={Math.abs(data.caixas.total_diferencas) < 0.01 ? "text-brand"
              : data.caixas.total_diferencas > 0 ? "text-amber-300" : "text-red-400"}
        />
      </div>

      {/* ── Vendas por forma de pagamento ────────────────────────────────── */}
      {data.por_forma.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Vendas por forma de pagamento
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {data.por_forma.map((f) => {
              const Icon = FORMA_ICON[f.forma] ?? DollarSign;
              return (
                <div key={f.forma} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium">{FORMA_LABEL[f.forma] ?? f.forma}</span>
                  </div>
                  <p className="mt-2 text-lg font-bold text-white">{fmtBRL(f.total)}</p>
                  <p className="text-xs text-slate-500">{f.qtd} {f.qtd === 1 ? "venda" : "vendas"}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Vendas por tipo de pedido ────────────────────────────────────── */}
      {data.por_tipo.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Vendas por canal
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {data.por_tipo.map((t) => (
              <div key={t.tipo} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-slate-400">{TIPO_LABEL[t.tipo] ?? t.tipo}</p>
                <p className="mt-2 text-lg font-bold text-white">{fmtBRL(t.total)}</p>
                <p className="text-xs text-slate-500">{t.qtd} {t.qtd === 1 ? "pedido" : "pedidos"}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Pico por hora (gráfico de barras) ────────────────────────────── */}
      {data.por_hora.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            Pico de vendas por hora
          </h2>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-32 items-end gap-1">
              {Array.from({ length: 24 }, (_, h) => {
                const item = data.por_hora.find((x) => x.hora === h);
                const v    = item?.total ?? 0;
                const pct  = (v / maxHora) * 100;
                return (
                  <div
                    key={h}
                    className="flex-1 group relative flex flex-col items-center justify-end"
                    title={`${h}h: ${fmtBRL(v)} (${item?.qtd ?? 0} pedidos)`}
                  >
                    <div
                      className="w-full rounded-t transition-all hover:brightness-125"
                      style={{
                        height: `${Math.max(2, pct)}%`,
                        background: v > 0 ? "var(--color-primary, #10b981)" : "rgba(148,163,184,0.1)",
                      }}
                    />
                    <span className="mt-1 text-[9px] text-slate-500">
                      {h % 3 === 0 ? `${h}h` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Top produtos & clientes ──────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top produtos */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            <Package className="h-3.5 w-3.5" />
            Top 5 produtos
          </h2>
          <div className="rounded-2xl border border-white/10 bg-white/5">
            {data.top_produtos.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Sem vendas no período</p>
            ) : (
              <div className="divide-y divide-white/5">
                {data.top_produtos.map((p, i) => (
                  <div key={(p.produto_id ?? "") + i} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                        {i + 1}
                      </span>
                      <p className="truncate text-sm font-medium text-white">{p.nome}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-white">{fmtBRL(p.receita)}</p>
                      <p className="text-xs text-slate-500">{p.qtd_vendida} un.</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Top clientes */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            <Trophy className="h-3.5 w-3.5" />
            Top 5 clientes
          </h2>
          <div className="rounded-2xl border border-white/10 bg-white/5">
            {data.top_clientes.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Sem clientes identificados no período</p>
            ) : (
              <div className="divide-y divide-white/5">
                {data.top_clientes.map((c, i) => (
                  <div key={c.cliente_id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                        {i + 1}
                      </span>
                      <p className="truncate text-sm font-medium text-white">{c.nome}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-white">{fmtBRL(c.total_gasto)}</p>
                      <p className="text-xs text-slate-500">{c.pedidos} pedido{c.pedidos !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, color, subtitle, hero,
}: {
  icon:     React.ElementType;
  label:    string;
  value:    string;
  color:    string;
  subtitle?: string;
  hero?:     boolean;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-4 ${hero ? "lg:col-span-1" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {subtitle && (
        <p className="mt-0.5 text-[10px] text-slate-500 truncate">{subtitle}</p>
      )}
    </div>
  );
}
