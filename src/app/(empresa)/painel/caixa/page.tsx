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
  const [caixa, setCaixa]     = useState<CaixaAtual | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Modal: abrir
  const [openAbrir, setOpenAbrir] = useState(false);
  const [valorAbertura, setValorAbertura] = useState("");
  const [obsAbertura, setObsAbertura] = useState("");

  // Modal: fechar
  const [openFechar, setOpenFechar] = useState(false);
  const [valorFechamento, setValorFechamento] = useState("");
  const [obsFechamento, setObsFechamento] = useState("");
  const [resultadoFechamento, setResultadoFechamento] = useState<{
    valor_esperado: number; valor_fechamento: number; diferenca: number;
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
      const valor = parseFloat(valorFechamento.replace(",", ".")) || 0;
      const res  = await fetch(`/api/painel/caixa/${caixa.id}/fechar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({
          valor_fechamento:       valor,
          observacoes_fechamento: obsFechamento || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResultadoFechamento({
          valor_esperado:   data.data.valor_esperado,
          valor_fechamento: data.data.valor_fechamento,
          diferenca:        data.data.diferenca,
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

      {/* ── Sem caixa aberto ───────────────────────────────────────────────── */}
      {!caixa && !loading && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-12 text-center">
          <Lock className="mx-auto h-12 w-12 text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-white">Caixa fechado</p>
          <p className="mt-1 text-xs text-slate-500">
            Abra o caixa para começar a registrar vendas, sangrias e reforços.
          </p>
        </div>
      )}

      {/* ── Caixa aberto ───────────────────────────────────────────────────── */}
      {caixa && (
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
              onClick={() => { setValorFechamento(""); setObsFechamento(""); setResultadoFechamento(null); setOpenFechar(true); }}
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
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6">
            {resultadoFechamento ? (
              // Tela de resultado
              <>
                <h3 className="mb-4 text-lg font-bold text-white">Caixa fechado</h3>
                <div className="space-y-3 rounded-xl bg-white/5 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Esperado</span>
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
                {Math.abs(resultadoFechamento.diferenca) >= 0.01 && (
                  <p className={`mt-3 text-xs ${resultadoFechamento.diferenca > 0 ? "text-amber-400" : "text-red-400"}`}>
                    {resultadoFechamento.diferenca > 0 ? "Sobra" : "Quebra"} de caixa registrada nas observações.
                  </p>
                )}
                <button onClick={fecharModalFechamento} className="mt-5 w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-white hover:brightness-110">
                  OK
                </button>
              </>
            ) : (
              // Form de fechamento
              <form onSubmit={handleFechar}>
                <div className="mb-5 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Fechar caixa</h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Conte o dinheiro físico no caixa e informe o total
                    </p>
                  </div>
                  <button type="button" onClick={() => setOpenFechar(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
                </div>

                <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
                  <strong>Esperado em caixa:</strong> {fmtBRL(caixa.saldo_esperado)}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Valor contado em dinheiro (R$)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={valorFechamento}
                      onChange={(e) => setValorFechamento(e.target.value.replace(/[^0-9,.]/g, ""))}
                      required
                      placeholder="0,00"
                      className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-2xl font-bold text-white text-center focus:border-brand/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Observações</label>
                    <input
                      value={obsFechamento}
                      onChange={(e) => setObsFechamento(e.target.value)}
                      placeholder="Ex: faltou X reais — investigar"
                      className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setOpenFechar(false)} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">Cancelar</button>
                    <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-50">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                      Fechar caixa
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
