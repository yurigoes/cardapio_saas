"use client";

/**
 * /painel/caixa — Operação de caixa do PDV
 *
 * Estados visuais:
 *   - Sem caixa aberto → CTA "Abrir caixa" + form de abertura
 *   - Com caixa aberto → cartões de saldo, vendas, totais; botões sangria/reforço/fechar
 *
 * Fluxo:
 *   1. Operador abre caixa informando dinheiro inicial (troco)
 *   2. Durante o turno: vendas em dinheiro entram automaticamente no movimento
 *      (via integração futura com PDV); sangrias/reforços feitos manualmente
 *   3. No fim do turno: fechar → operador conta o dinheiro físico, sistema
 *      compara com esperado, mostra a diferença e arquiva o caixa
 */
import { useEffect, useState, useCallback } from "react";
import {
  Wallet, Lock, Unlock, ArrowDownCircle, ArrowUpCircle,
  TrendingUp, TrendingDown, AlertCircle, Loader2, X,
  Banknote, QrCode, CreditCard, DollarSign,
  History, Calendar, ChevronRight,
} from "lucide-react";

interface CaixaAtual {
  id:                    string;
  usuario_abertura_nome: string | null;
  valor_abertura:        number;
  observacoes:           string | null;
  aberto_em:             string;
  status:                string;
  reforcos:              number;
  sangrias:              number;
  estornos:              number;
  total_vendas:          number;
  vendas_dinheiro:       number;
  vendas_por_forma:      Record<string, number>;
  saldo_esperado:        number;
}

interface CaixaListItem {
  id:                       string;
  status:                   string;
  valor_abertura:           number;
  valor_esperado:           number | null;
  valor_fechamento:         number | null;
  diferenca:                number | null;
  aberto_em:                string;
  fechado_em:               string | null;
  usuario_abertura_nome:    string | null;
  usuario_fechamento_nome:  string | null;
  total_vendas:             number;
}

interface MovimentoDetalhe {
  id:              string;
  tipo:            string;
  forma_pagamento: string | null;
  valor:           number;
  descricao:       string | null;
  pedido_id:       string | null;
  pedido_numero:   number | null;
  usuario_nome:    string | null;
  criado_em:       string;
}

interface CaixaDetalhe {
  id:                       string;
  status:                   string;
  valor_abertura:           number;
  valor_esperado:           number | null;
  valor_fechamento:         number | null;
  diferenca:                number | null;
  observacoes:              string | null;
  observacoes_fechamento:   string | null;
  aberto_em:                string;
  fechado_em:               string | null;
  usuario_abertura_nome:    string | null;
  usuario_fechamento_nome:  string | null;
}

type Tab = "atual" | "historico";

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader(): HeadersInit { return { Authorization: `Bearer ${getToken()}` }; }

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function durationFrom(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
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

export default function CaixaPage() {
  const [tab, setTab] = useState<Tab>("atual");
  const [caixa, setCaixa]     = useState<CaixaAtual | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Histórico
  const [historico, setHistorico] = useState<CaixaListItem[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "fechado" | "aberto">("todos");

  // Detalhe
  const [detalhe, setDetalhe] = useState<{
    caixa: CaixaDetalhe;
    movimentos: MovimentoDetalhe[];
    totais: { por_tipo: Record<string, number>; por_forma: Record<string, number> };
  } | null>(null);
  const [detalheLoading, setDetalheLoading] = useState(false);

  // Modal: abrir
  const [openAbrir, setOpenAbrir] = useState(false);
  const [valorAbertura, setValorAbertura] = useState("");
  const [obsAbertura, setObsAbertura] = useState("");

  // Modal: fechar
  const [openFechar, setOpenFechar] = useState(false);
  const [valorFechamento, setValorFechamento] = useState("");
  const [obsFechamento, setObsFechamento] = useState("");
  const [valoresPorForma, setValoresPorForma] = useState<Record<string, string>>({});
  const [resultadoFechamento, setResultadoFechamento] = useState<{
    valor_esperado: number; valor_fechamento: number; diferenca: number;
    esperados_por_forma?:  Record<string, number> | null;
    informados_por_forma?: Record<string, number> | null;
    diferencas_por_forma?: Record<string, number> | null;
  } | null>(null);

  // Modal: sangria/reforço
  const [openMov, setOpenMov] = useState<"sangria" | "reforco" | null>(null);
  const [movValor, setMovValor] = useState("");
  const [movDescricao, setMovDescricao] = useState("");

  const [saving, setSaving] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/painel/caixa/atual", { headers: authHeader() });
      const data = await res.json();
      if (data.success) setCaixa(data.data.caixa);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchHistorico = useCallback(async () => {
    setHistoricoLoading(true);
    try {
      const sp = new URLSearchParams({ page: "1", limit: "30" });
      if (filtroStatus !== "todos") sp.set("status", filtroStatus);
      const res  = await fetch(`/api/painel/caixa?${sp}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) setHistorico(data.data ?? []);
    } finally {
      setHistoricoLoading(false);
    }
  }, [filtroStatus]);

  useEffect(() => {
    if (tab === "historico") fetchHistorico();
  }, [tab, fetchHistorico]);

  async function abrirDetalhe(id: string) {
    setDetalheLoading(true);
    setDetalhe(null);
    try {
      const res  = await fetch(`/api/painel/caixa/${id}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) setDetalhe(data.data);
    } finally {
      setDetalheLoading(false);
    }
  }

  // Auto-refresh a cada 30s quando caixa está aberto (vendas vão chegando)
  useEffect(() => {
    if (!caixa) return;
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, [caixa, fetch_]);

  // ── Ações ──────────────────────────────────────────────────────────────────

  async function handleAbrir(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const valor = parseFloat(valorAbertura.replace(",", ".")) || 0;
      const res  = await fetch("/api/painel/caixa/abrir", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({ valor_abertura: valor, observacoes: obsAbertura || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setOpenAbrir(false);
        setValorAbertura("");
        setObsAbertura("");
        await fetch_();
        setToast({ type: "ok", msg: "Caixa aberto com sucesso!" });
      } else {
        setToast({ type: "err", msg: data.error || "Erro ao abrir caixa" });
      }
    } finally { setSaving(false); }
  }

  async function handleFechar(e: React.FormEvent) {
    e.preventDefault();
    if (!caixa) return;
    setSaving(true);
    try {
      // Dinheiro: usa valor contado no input separado (gaveta física)
      const valorDin = parseFloat((valoresPorForma.dinheiro ?? valorFechamento).replace(",", ".")) || 0;

      // Demais formas
      const informados: Record<string, number> = { dinheiro: valorDin };
      for (const f of ["pix","credito","debito","vale","outro"]) {
        const v = parseFloat((valoresPorForma[f] ?? "0").replace(",", ".")) || 0;
        informados[f] = v;
      }

      const res  = await fetch(`/api/painel/caixa/${caixa.id}/fechar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({
          valor_fechamento:       valorDin,
          observacoes_fechamento: obsFechamento || undefined,
          valores_informados:     informados,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResultadoFechamento({
          valor_esperado:       data.data.valor_esperado,
          valor_fechamento:     data.data.valor_fechamento,
          diferenca:            data.data.diferenca,
          esperados_por_forma:  data.data.esperados_por_forma,
          informados_por_forma: data.data.informados_por_forma,
          diferencas_por_forma: data.data.diferencas_por_forma,
        });
      } else {
        setToast({ type: "err", msg: data.error || "Erro ao fechar caixa" });
      }
    } finally { setSaving(false); }
  }

  function fecharModalFechamento() {
    setOpenFechar(false);
    setValorFechamento("");
    setObsFechamento("");
    setResultadoFechamento(null);
    fetch_();
  }

  async function handleMovimento(e: React.FormEvent) {
    e.preventDefault();
    if (!caixa || !openMov) return;
    setSaving(true);
    try {
      const valor = parseFloat(movValor.replace(",", ".")) || 0;
      const res  = await fetch(`/api/painel/caixa/${caixa.id}/movimento`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({ tipo: openMov, valor, descricao: movDescricao || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setOpenMov(null);
        setMovValor("");
        setMovDescricao("");
        await fetch_();
        setToast({ type: "ok", msg: openMov === "sangria" ? "Sangria registrada" : "Reforço registrado" });
      } else {
        setToast({ type: "err", msg: data.error || "Erro" });
      }
    } finally { setSaving(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Wallet className="h-6 w-6 text-brand" />
            Caixa
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {caixa
              ? `Aberto há ${durationFrom(caixa.aberto_em)} por ${caixa.usuario_abertura_nome ?? "operador"}`
              : "Nenhum caixa aberto no momento"}
          </p>
        </div>
        {!caixa && (
          <button
            onClick={() => setOpenAbrir(true)}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:brightness-110 transition"
          >
            <Unlock className="h-4 w-4" />
            Abrir caixa
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            toast.type === "ok"
              ? "border-brand/20 bg-brand/10 text-brand"
              : "border-red-500/20 bg-red-500/10 text-red-400"
          }`}
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
        {([
          ["atual",     "Atual",     Wallet],
          ["historico", "Histórico", History],
        ] as const).map(([key, label, Icon]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                active ? "bg-brand/15 text-brand" : "text-slate-400 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── ABA HISTÓRICO ────────────────────────────────────────────────── */}
      {tab === "historico" && (
        <div className="space-y-3">
          {/* Filtro */}
          <div className="flex items-center gap-2">
            {(["todos", "fechado", "aberto"] as const).map((s) => {
              const active = filtroStatus === s;
              return (
                <button
                  key={s}
                  onClick={() => setFiltroStatus(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    active
                      ? "bg-brand/15 text-brand"
                      : "border border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  {s === "todos" ? "Todos" : s === "fechado" ? "Fechados" : "Abertos"}
                </button>
              );
            })}
          </div>

          {/* Lista */}
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            {historicoLoading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              </div>
            ) : historico.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Nenhum caixa encontrado
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {historico.map((c) => {
                  const aberto = c.status === "aberto";
                  const dif    = c.diferenca;
                  return (
                    <button
                      key={c.id}
                      onClick={() => abrirDetalhe(c.id)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/5 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Calendar className="h-4 w-4 flex-shrink-0 text-slate-500" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white">
                              {fmtDateTime(c.aberto_em)}
                            </p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              aberto ? "bg-brand/15 text-brand" : "bg-slate-500/15 text-slate-400"
                            }`}>
                              {aberto ? "ABERTO" : "FECHADO"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {c.usuario_abertura_nome ?? "—"}
                            {c.fechado_em && ` → ${fmtDateTime(c.fechado_em)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Vendas</p>
                          <p className="text-sm font-bold text-white">{fmtBRL(c.total_vendas)}</p>
                        </div>
                        {dif != null && (
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Diferença</p>
                            <p className={`text-sm font-bold ${
                              Math.abs(dif) < 0.01 ? "text-brand" :
                              dif > 0 ? "text-amber-300" : "text-red-400"
                            }`}>
                              {dif >= 0 ? "+" : ""}{fmtBRL(dif)}
                            </p>
                          </div>
                        )}
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sem caixa aberto ───────────────────────────────────────────────── */}
      {tab === "atual" && !caixa && !loading && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-12 text-center">
          <Lock className="mx-auto h-12 w-12 text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-white">Caixa fechado</p>
          <p className="mt-1 text-xs text-slate-500">
            Abra o caixa para começar a registrar vendas, sangrias e reforços.
          </p>
        </div>
      )}

      {/* ── Caixa aberto ───────────────────────────────────────────────────── */}
      {tab === "atual" && caixa && (
        <>
          {/* Saldo e ações */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Saldo esperado em dinheiro */}
            <div className="lg:col-span-2 rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/10 to-transparent p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand">
                Saldo esperado em caixa
              </p>
              <p className="mt-2 text-4xl font-black text-white">
                {fmtBRL(caixa.saldo_esperado)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Abertura {fmtBRL(caixa.valor_abertura)} + Reforços {fmtBRL(caixa.reforcos)} + Vendas dinheiro {fmtBRL(caixa.vendas_dinheiro)} − Sangrias {fmtBRL(caixa.sangrias)}
              </p>
            </div>

            {/* Total vendas */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Vendas no turno
              </p>
              <p className="mt-2 text-3xl font-bold text-white">
                {fmtBRL(caixa.total_vendas)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Aberto em {fmtDateTime(caixa.aberto_em)}
              </p>
            </div>
          </div>

          {/* Ações principais */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => { setMovValor(""); setMovDescricao(""); setOpenMov("reforco"); }}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white hover:bg-white/10 transition"
            >
              <ArrowUpCircle className="h-4 w-4 text-brand" />
              Reforço
            </button>
            <button
              onClick={() => { setMovValor(""); setMovDescricao(""); setOpenMov("sangria"); }}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white hover:bg-white/10 transition"
            >
              <ArrowDownCircle className="h-4 w-4 text-amber-400" />
              Sangria
            </button>
            <button
              onClick={() => { setValorFechamento(""); setObsFechamento(""); setValoresPorForma({}); setResultadoFechamento(null); setOpenFechar(true); }}
              className="flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/20 transition"
            >
              <Lock className="h-4 w-4" />
              Fechar caixa
            </button>
          </div>

          {/* Vendas por forma de pagamento */}
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Vendas por forma de pagamento
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["dinheiro", "pix", "credito", "debito"] as const).map((forma) => {
                const valor = caixa.vendas_por_forma[forma] ?? 0;
                const Icon  = FORMA_ICON[forma];
                return (
                  <div key={forma} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-slate-400" />
                      <span className="text-xs text-slate-400">{FORMA_LABEL[forma]}</span>
                    </div>
                    <p className="mt-2 text-lg font-bold text-white">{fmtBRL(valor)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Movimentos resumidos */}
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Movimentos do turno
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-brand">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Reforços</span>
                </div>
                <p className="mt-2 text-lg font-bold text-white">{fmtBRL(caixa.reforcos)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-amber-400">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-xs">Sangrias</span>
                </div>
                <p className="mt-2 text-lg font-bold text-white">{fmtBRL(caixa.sangrias)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-red-400">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-xs">Estornos</span>
                </div>
                <p className="mt-2 text-lg font-bold text-white">{fmtBRL(caixa.estornos)}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Modal: abrir caixa ──────────────────────────────────────────── */}
      {openAbrir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpenAbrir(false)} />
          <form onSubmit={handleAbrir} className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Abrir caixa</h3>
                <p className="mt-0.5 text-xs text-slate-400">Informe o valor inicial em dinheiro (troco)</p>
              </div>
              <button type="button" onClick={() => setOpenAbrir(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Valor de abertura (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valorAbertura}
                  onChange={(e) => setValorAbertura(e.target.value.replace(/[^0-9,.]/g, ""))}
                  required
                  placeholder="0,00"
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-2xl font-bold text-white text-center focus:border-brand/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Observações (opcional)</label>
                <input
                  value={obsAbertura}
                  onChange={(e) => setObsAbertura(e.target.value)}
                  placeholder="Ex: troco em moedas + R$ 200"
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setOpenAbrir(false)} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                  Abrir
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal: sangria/reforço ─────────────────────────────────────────── */}
      {openMov && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpenMov(null)} />
          <form onSubmit={handleMovimento} className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {openMov === "sangria" ? "Sangria" : "Reforço"}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {openMov === "sangria"
                    ? "Retirada de dinheiro do caixa"
                    : "Aporte de dinheiro no caixa"}
                </p>
              </div>
              <button type="button" onClick={() => setOpenMov(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Valor (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={movValor}
                  onChange={(e) => setMovValor(e.target.value.replace(/[^0-9,.]/g, ""))}
                  required
                  placeholder="0,00"
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-2xl font-bold text-white text-center focus:border-brand/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Descrição</label>
                <input
                  value={movDescricao}
                  onChange={(e) => setMovDescricao(e.target.value)}
                  placeholder={openMov === "sangria" ? "Ex: pagamento fornecedor" : "Ex: troco extra"}
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setOpenMov(null)} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">Cancelar</button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
                    openMov === "sangria" ? "bg-amber-500 hover:bg-amber-400" : "bg-brand hover:brightness-110"
                  }`}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : openMov === "sangria" ? <ArrowDownCircle className="h-4 w-4" /> : <ArrowUpCircle className="h-4 w-4" />}
                  Registrar
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal: fechar caixa ────────────────────────────────────────────── */}
      {openFechar && caixa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={resultadoFechamento ? fecharModalFechamento : () => setOpenFechar(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 max-h-[90vh] overflow-auto">
            {resultadoFechamento ? (
              // ── Tela de resultado ────────────────────────────────────────
              <div className="p-6">
                <h3 className="mb-4 text-lg font-bold text-white">Caixa fechado</h3>

                {/* Resumo dinheiro (gaveta) */}
                <div className="space-y-3 rounded-xl bg-white/5 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Esperado em gaveta (dinheiro)</span>
                    <span className="font-bold text-white">{fmtBRL(resultadoFechamento.valor_esperado)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Informado</span>
                    <span className="font-bold text-white">{fmtBRL(resultadoFechamento.valor_fechamento)}</span>
                  </div>
                  <div className={`flex justify-between border-t border-white/5 pt-3 text-base font-bold ${
                    Math.abs(resultadoFechamento.diferenca) < 0.01 ? "text-brand" :
                    resultadoFechamento.diferenca > 0 ? "text-amber-300" : "text-red-400"
                  }`}>
                    <span>Diferença</span>
                    <span>{resultadoFechamento.diferenca >= 0 ? "+" : ""}{fmtBRL(resultadoFechamento.diferenca)}</span>
                  </div>
                </div>

                {/* Detalhamento por forma */}
                {resultadoFechamento.diferencas_por_forma && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Conferência por forma de pagamento
                    </p>
                    <div className="overflow-hidden rounded-xl border border-white/10">
                      <table className="w-full text-xs">
                        <thead className="bg-white/5">
                          <tr className="text-left text-[10px] uppercase text-slate-500">
                            <th className="px-3 py-2">Forma</th>
                            <th className="px-3 py-2 text-right">Esperado</th>
                            <th className="px-3 py-2 text-right">Informado</th>
                            <th className="px-3 py-2 text-right">Diferença</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {(["pix","dinheiro","credito","debito","vale","outro"] as const).map(f => {
                            const esp  = resultadoFechamento.esperados_por_forma?.[f]  ?? 0;
                            const inf  = resultadoFechamento.informados_por_forma?.[f] ?? 0;
                            const dif  = resultadoFechamento.diferencas_por_forma?.[f] ?? 0;
                            const cor  = Math.abs(dif) < 0.01 ? "text-slate-400"
                                       : dif > 0 ? "text-amber-300" : "text-red-400";
                            return (
                              <tr key={f}>
                                <td className="px-3 py-2 capitalize text-slate-300">{f}</td>
                                <td className="px-3 py-2 text-right font-mono text-slate-300">{fmtBRL(esp)}</td>
                                <td className="px-3 py-2 text-right font-mono text-white">{fmtBRL(inf)}</td>
                                <td className={`px-3 py-2 text-right font-mono font-semibold ${cor}`}>
                                  {dif >= 0 ? "+" : ""}{fmtBRL(dif)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {Math.abs(resultadoFechamento.diferenca) >= 0.01 && (
                  <p className={`mt-3 text-xs ${resultadoFechamento.diferenca > 0 ? "text-amber-400" : "text-red-400"}`}>
                    {resultadoFechamento.diferenca > 0 ? "Sobra" : "Quebra"} de caixa em dinheiro registrada.
                  </p>
                )}
                <button onClick={fecharModalFechamento} className="mt-5 w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-white hover:brightness-110">
                  OK
                </button>
              </div>
            ) : (
              // ── Form de fechamento detalhado ─────────────────────────────
              <form onSubmit={handleFechar} className="p-6">
                <div className="mb-5 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Fechar caixa</h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Confira cada forma de pagamento. Dinheiro = gaveta física.
                    </p>
                  </div>
                  <button type="button" onClick={() => setOpenFechar(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
                </div>

                {/* Tabela por forma com inputs */}
                <div className="mb-4 overflow-hidden rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5">
                      <tr className="text-left text-[10px] uppercase text-slate-500">
                        <th className="px-3 py-2">Forma</th>
                        <th className="px-3 py-2 text-right">Esperado</th>
                        <th className="px-3 py-2 text-right">Informado</th>
                        <th className="px-3 py-2 text-right">Diferença</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(["pix","dinheiro","credito","debito","vale","outro"] as const).map(f => {
                        const esperadoVendas = caixa.vendas_por_forma?.[f] ?? 0;
                        // Para 'dinheiro', soma também abertura+reforços-sangrias-estornos
                        const esperado = f === "dinheiro"
                          ? caixa.saldo_esperado
                          : esperadoVendas;
                        const informadoStr = valoresPorForma[f] ?? "";
                        const informadoNum = parseFloat(informadoStr.replace(",", ".")) || 0;
                        const dif = informadoNum - esperado;
                        const corDif = !informadoStr ? "text-slate-600"
                                     : Math.abs(dif) < 0.01 ? "text-emerald-400"
                                     : dif > 0 ? "text-amber-300" : "text-red-400";
                        return (
                          <tr key={f}>
                            <td className="px-3 py-2 capitalize text-slate-300 font-medium">{f}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-400">{fmtBRL(esperado)}</td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="text" inputMode="decimal" placeholder="0,00"
                                value={informadoStr}
                                onChange={e => setValoresPorForma(prev => ({
                                  ...prev, [f]: e.target.value.replace(/[^0-9,.]/g, "")
                                }))}
                                className="w-24 rounded border border-white/10 bg-slate-800 px-2 py-1 text-right font-mono text-white focus:border-brand/50 focus:outline-none"
                              />
                            </td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold ${corDif}`}>
                              {informadoStr
                                ? `${dif >= 0 ? "+" : ""}${fmtBRL(dif)}`
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
                  <strong>Importante:</strong> diferença em dinheiro é sobra/quebra real.
                  Outras formas mostram divergência entre sistema e relatório do gateway/maquininha.
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Observações</label>
                  <input
                    value={obsFechamento}
                    onChange={(e) => setObsFechamento(e.target.value)}
                    placeholder="Ex: divergência maquininha — abrir chamado"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                  />
                </div>

                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => setOpenFechar(false)} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">Cancelar</button>
                  <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    Fechar caixa
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: detalhe do caixa (histórico) ─────────────────────────── */}
      {(detalhe || detalheLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setDetalhe(null); }} />
          <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6">
            {detalheLoading && !detalhe && (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
              </div>
            )}

            {detalhe && (
              <>
                <div className="mb-5 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Caixa de {fmtDateTime(detalhe.caixa.aberto_em)}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {detalhe.caixa.usuario_abertura_nome ?? "—"}
                      {detalhe.caixa.fechado_em && (
                        <> · Fechado por {detalhe.caixa.usuario_fechamento_nome ?? "—"} em {fmtDateTime(detalhe.caixa.fechado_em)}</>
                      )}
                    </p>
                  </div>
                  <button onClick={() => setDetalhe(null)} className="text-slate-400 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Resumo financeiro */}
                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Abertura</p>
                    <p className="text-sm font-bold text-white">{fmtBRL(detalhe.caixa.valor_abertura)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Esperado</p>
                    <p className="text-sm font-bold text-white">
                      {detalhe.caixa.valor_esperado != null ? fmtBRL(detalhe.caixa.valor_esperado) : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Contado</p>
                    <p className="text-sm font-bold text-white">
                      {detalhe.caixa.valor_fechamento != null ? fmtBRL(detalhe.caixa.valor_fechamento) : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Diferença</p>
                    <p className={`text-sm font-bold ${
                      detalhe.caixa.diferenca == null ? "text-slate-400" :
                      Math.abs(detalhe.caixa.diferenca) < 0.01 ? "text-brand" :
                      detalhe.caixa.diferenca > 0 ? "text-amber-300" : "text-red-400"
                    }`}>
                      {detalhe.caixa.diferenca == null ? "—" :
                        (detalhe.caixa.diferenca >= 0 ? "+" : "") + fmtBRL(detalhe.caixa.diferenca)}
                    </p>
                  </div>
                </div>

                {/* Vendas por forma */}
                {Object.keys(detalhe.totais.por_forma).length > 0 && (
                  <div className="mb-5">
                    <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
                      Vendas por forma de pagamento
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {Object.entries(detalhe.totais.por_forma).map(([forma, valor]) => {
                        const Icon = FORMA_ICON[forma] ?? DollarSign;
                        return (
                          <div key={forma} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <Icon className="h-3 w-3" />
                              {FORMA_LABEL[forma] ?? forma}
                            </div>
                            <p className="text-sm font-bold text-white">{fmtBRL(valor)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Movimentos */}
                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
                    Movimentos ({detalhe.movimentos.length})
                  </p>
                  {detalhe.movimentos.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">Nenhum movimento</p>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-slate-950 max-h-72 overflow-y-auto divide-y divide-white/5">
                      {detalhe.movimentos.map((m) => {
                        const sinal = m.tipo === "venda" || m.tipo === "reforco" ? "+" : "−";
                        const cor =
                          m.tipo === "venda"   ? "text-brand"  :
                          m.tipo === "reforco" ? "text-brand"  :
                          m.tipo === "sangria" ? "text-amber-400" :
                          "text-red-400";
                        return (
                          <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                  m.tipo === "venda"   ? "bg-brand/15 text-brand" :
                                  m.tipo === "reforco" ? "bg-brand/15 text-brand" :
                                  m.tipo === "sangria" ? "bg-amber-500/15 text-amber-400" :
                                  "bg-red-500/15 text-red-400"
                                }`}>
                                  {m.tipo}
                                </span>
                                {m.pedido_numero && (
                                  <span className="text-[11px] font-mono text-slate-500">#{m.pedido_numero}</span>
                                )}
                                {m.forma_pagamento && (
                                  <span className="text-[11px] text-slate-500">{FORMA_LABEL[m.forma_pagamento] ?? m.forma_pagamento}</span>
                                )}
                              </div>
                              {m.descricao && (
                                <p className="mt-0.5 truncate text-xs text-slate-400">{m.descricao}</p>
                              )}
                              <p className="mt-0.5 text-[10px] text-slate-600">
                                {fmtDateTime(m.criado_em)}
                                {m.usuario_nome && ` · ${m.usuario_nome}`}
                              </p>
                            </div>
                            <p className={`flex-shrink-0 text-sm font-bold ${cor}`}>
                              {sinal}{fmtBRL(m.valor)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Observações */}
                {(detalhe.caixa.observacoes || detalhe.caixa.observacoes_fechamento) && (
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 space-y-2 text-xs">
                    {detalhe.caixa.observacoes && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Obs. abertura</p>
                        <p className="text-slate-300">{detalhe.caixa.observacoes}</p>
                      </div>
                    )}
                    {detalhe.caixa.observacoes_fechamento && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Obs. fechamento</p>
                        <p className="text-slate-300">{detalhe.caixa.observacoes_fechamento}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
