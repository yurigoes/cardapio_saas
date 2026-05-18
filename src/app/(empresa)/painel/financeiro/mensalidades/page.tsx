"use client";

/**
 * /painel/financeiro/mensalidades — empresa vê suas faturas + ativa assinatura
 * recorrente OU paga manualmente cada fatura via Checkout MP.
 */
import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Receipt, RefreshCw, Loader2, ExternalLink, CreditCard, Repeat,
  CheckCircle2, AlertTriangle, Calendar, XCircle, Lock,
} from "lucide-react";
import { alertar, confirmar } from "@/components/ui/ConfirmModal";

interface Mensalidade {
  id:             string;
  mes_referencia: string;
  valor:          number | string;
  vencimento:     string;
  status:         "aberta" | "paga" | "atrasada" | "cancelada" | "isenta";
  mp_init_point:  string | null;
  pago_em:        string | null;
  pago_via:       string | null;
  plano_nome:     string | null;
}

interface Assinatura {
  id:               string;
  status:           "pendente" | "autorizada" | "ativa" | "pausada" | "cancelada";
  valor_mensal:     number | string;
  proxima_cobranca: string | null;
  mp_init_point:    string | null;
}

const STATUS_BADGE: Record<Mensalidade["status"], { label: string; cor: string }> = {
  aberta:    { label: "Aberta",    cor: "border-blue-500/30 bg-blue-500/10 text-blue-300" },
  paga:      { label: "Paga",      cor: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  atrasada:  { label: "Atrasada",  cor: "border-red-500/30 bg-red-500/10 text-red-300" },
  cancelada: { label: "Cancelada", cor: "border-slate-500/30 bg-slate-500/10 text-slate-300" },
  isenta:    { label: "Isenta",    cor: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
};

const ASSIN_BADGE: Record<Assinatura["status"], { label: string; cor: string }> = {
  pendente:   { label: "Aguardando cartão", cor: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  autorizada: { label: "Autorizada",        cor: "border-blue-500/30 bg-blue-500/10 text-blue-300" },
  ativa:      { label: "Ativa",             cor: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  pausada:    { label: "Pausada",           cor: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  cancelada:  { label: "Cancelada",         cor: "border-slate-500/30 bg-slate-500/10 text-slate-300" },
};

function authHeader(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

function fmtBRL(v: number | string) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

interface BloqueioStatus {
  bloqueada: boolean; motivo: string | null; total_vencido: number; cobrancas_qtd: number;
}
interface Avulsa {
  id: string; nome: string; motivo: string | null; valor: string;
  vencimento: string; status: string; mp_init_point: string | null;
}

function MensalidadesContent() {
  const sp = useSearchParams();
  const [list, setList]           = useState<Mensalidade[]>([]);
  const [avulsas, setAvulsas]     = useState<Avulsa[]>([]);
  const [bloqueio, setBloqueio]   = useState<BloqueioStatus | null>(null);
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [loading, setLoading]     = useState(true);
  const [pagandoId, setPagandoId] = useState<string | null>(null);
  const [ativando, setAtivando]   = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, b, a] = await Promise.all([
        fetch("/api/painel/mensalidades",      { headers: authHeader() }).then(r => r.json()),
        fetch("/api/painel/bloqueio",          { headers: authHeader() }).then(r => r.json()).catch(() => null),
        fetch("/api/painel/cobrancas-avulsas", { headers: authHeader() }).then(r => r.json()).catch(() => null),
      ]);
      if (r.success) {
        setList(r.data.mensalidades ?? []);
        setAssinatura(r.data.assinatura_ativa ?? null);
      }
      if (b?.success) setBloqueio(b.data);
      if (a?.success) setAvulsas(a.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Mostra mensagem se voltou do checkout
  useEffect(() => {
    const fatura = sp?.get("fatura");
    const ass    = sp?.get("assinatura");
    if (fatura === "ok") {
      alertar({ titulo: "Pagamento processando",
        mensagem: "Recebemos sua confirmação. Pode levar alguns minutos pra atualizar.",
        tipo: "sucesso" });
    } else if (fatura === "fail") {
      alertar({ titulo: "Pagamento falhou", mensagem: "Tente novamente ou use outra forma.", tipo: "perigo" });
    } else if (ass === "ok") {
      alertar({ titulo: "Assinatura criada", mensagem: "Aguarde a confirmação do MP (alguns minutos).", tipo: "sucesso" });
    }
  }, [sp]);

  async function pagar(id: string) {
    setPagandoId(id);
    try {
      const r = await fetch(`/api/painel/mensalidades/${id}/pagar`, {
        method: "POST", headers: authHeader(),
      });
      const d = await r.json();
      if (d.success && d.data?.init_point) {
        window.open(d.data.init_point, "_blank", "noopener");
      } else {
        await alertar({ titulo: "Falha ao gerar link", mensagem: d.error?.message ?? "?", tipo: "perigo" });
      }
    } finally { setPagandoId(null); }
  }

  async function ativarAssinatura() {
    if (!await confirmar({
      titulo: "Ativar assinatura recorrente?",
      mensagem: "Você cadastra um cartão no Mercado Pago e ele cobra automaticamente todo mês. Pode cancelar a qualquer momento.",
      okLabel: "Ativar agora",
    })) return;

    setAtivando(true);
    try {
      const r = await fetch("/api/painel/assinatura", {
        method: "POST", headers: authHeader(),
      });
      const d = await r.json();
      if (d.success && d.data?.init_point) {
        window.open(d.data.init_point, "_blank", "noopener");
        // Recarrega após 2s pra pegar a nova assinatura pendente
        setTimeout(carregar, 2000);
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "?", tipo: "perigo" });
      }
    } finally { setAtivando(false); }
  }

  async function cancelarAssinatura() {
    if (!await confirmar({
      titulo: "Cancelar assinatura?",
      mensagem: "Você volta pra cobrança manual (precisa pagar cada fatura). Cobranças já feitas não são estornadas.",
      okLabel: "Cancelar assinatura", perigo: true,
    })) return;

    try {
      const r = await fetch("/api/painel/assinatura", {
        method: "DELETE", headers: authHeader(),
      });
      const d = await r.json();
      if (d.success) {
        await alertar({ titulo: "Assinatura cancelada", tipo: "sucesso" });
        carregar();
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "?", tipo: "perigo" });
      }
    } catch {}
  }

  async function pagarAvulsa(id: string) {
    setPagandoId(id);
    try {
      const r = await fetch(`/api/painel/cobrancas-avulsas/${id}/pagar`, {
        method: "POST", headers: authHeader(),
      });
      const d = await r.json();
      if (d.success && d.data?.init_point) {
        window.open(d.data.init_point, "_blank", "noopener");
      } else {
        await alertar({ titulo: "Falha ao gerar link", mensagem: d.error?.message ?? "?", tipo: "perigo" });
      }
    } finally { setPagandoId(null); }
  }

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      {/* Banner bloqueio */}
      {bloqueio?.bloqueada && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5">
          <div className="flex items-start gap-3">
            <Lock className="h-6 w-6 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-red-200 uppercase tracking-wider text-sm">
                Sistema bloqueado por inadimplência
              </p>
              <p className="mt-1 text-sm text-red-200/90">{bloqueio.motivo}</p>
              <p className="mt-2 text-xs text-red-300/80">
                Total vencido: <strong>{fmtBRL(bloqueio.total_vencido)}</strong> ·
                Após pagamento confirmado, liberação é imediata.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Receipt className="h-5 w-5 text-brand" /> Mensalidades
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Suas faturas mensais e cobrança recorrente
          </p>
        </div>
        <button onClick={carregar} disabled={loading}
          className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Card assinatura */}
      <section className={`rounded-2xl border p-5 ${
        assinatura?.status === "ativa"     ? "border-emerald-500/30 bg-emerald-500/5" :
        assinatura?.status === "pendente"  ? "border-amber-500/30 bg-amber-500/5"     :
                                              "border-blue-500/30 bg-blue-500/5"
      }`}>
        {assinatura ? (
          <div className="flex items-start gap-3 flex-wrap">
            <Repeat className={`h-6 w-6 flex-shrink-0 mt-0.5 ${
              assinatura.status === "ativa"    ? "text-emerald-400" :
              assinatura.status === "pendente" ? "text-amber-400"   :
                                                  "text-blue-400"
            }`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white">Assinatura recorrente</h2>
                <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${ASSIN_BADGE[assinatura.status].cor}`}>
                  {ASSIN_BADGE[assinatura.status].label}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-300">
                <strong className="text-white">{fmtBRL(assinatura.valor_mensal)}</strong>/mês via Mercado Pago
                {assinatura.proxima_cobranca && (
                  <span> · Próxima cobrança: <strong>{fmtData(assinatura.proxima_cobranca)}</strong></span>
                )}
              </p>

              {assinatura.status === "pendente" && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-sm text-amber-200 font-medium">
                    ⏳ Aguardando você cadastrar o cartão no Mercado Pago
                  </p>
                  <p className="mt-1 text-xs text-amber-200/80">
                    Clique abaixo pra finalizar a ativação. Após cadastrar o cartão,
                    o MP cobra <strong>{fmtBRL(assinatura.valor_mensal)}</strong> automaticamente todo mês.
                  </p>
                  {assinatura.mp_init_point ? (
                    <a
                      href={assinatura.mp_init_point}
                      target="_blank" rel="noopener"
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-400">
                      <CreditCard className="h-4 w-4" />
                      Cadastrar cartão agora
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <p className="mt-2 text-xs text-red-300">
                      ⚠ Link MP não foi gerado — cancele e tente ativar de novo.
                    </p>
                  )}
                </div>
              )}
            </div>
            {(assinatura.status === "ativa" || assinatura.status === "pendente") && (
              <button onClick={cancelarAssinatura}
                className="rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-4 py-2 text-xs font-bold text-red-300">
                Cancelar
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <Repeat className="h-6 w-6 flex-shrink-0 mt-0.5 text-blue-400" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-white">Quer pagar automaticamente todo mês?</h2>
              <p className="mt-1 text-sm text-slate-300">
                Ative a assinatura recorrente: cartão tokenizado no Mercado Pago,
                cobrado automaticamente. Pode cancelar quando quiser.
              </p>
              <button onClick={ativarAssinatura} disabled={ativando}
                className="mt-3 flex items-center gap-2 rounded-xl bg-brand hover:opacity-90 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                {ativando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {ativando ? "Criando..." : "Ativar assinatura recorrente"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Lista mensalidades */}
      <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="border-b border-white/5 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Histórico de faturas
          </h2>
        </div>
        {loading && list.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            Nenhuma mensalidade emitida ainda
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {list.map(m => {
              const cfg = STATUS_BADGE[m.status];
              const podePagar = m.status === "aberta" || m.status === "atrasada";
              return (
                <div key={m.id} className="p-4 flex items-center gap-3 flex-wrap">
                  <Calendar className="h-5 w-5 text-slate-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">
                      {new Date(m.mes_referencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {m.plano_nome ? `${m.plano_nome} · ` : ""}Venc. {fmtData(m.vencimento)}
                      {m.pago_em && <span className="text-emerald-400"> · Pago em {fmtData(m.pago_em)}</span>}
                    </p>
                  </div>
                  <p className="text-base font-bold text-white">{fmtBRL(m.valor)}</p>
                  <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold ${cfg.cor}`}>
                    {cfg.label}
                  </span>
                  {podePagar && (
                    <button onClick={() => pagar(m.id)} disabled={pagandoId !== null}
                      className="flex items-center gap-1 rounded-xl bg-brand hover:opacity-90 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                      {pagandoId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                      Pagar
                    </button>
                  )}
                  {m.status === "paga" && (
                    <a href={`/api/painel/mensalidades/${m.id}/comprovante`} target="_blank" rel="noopener"
                      className="flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Comprovante
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Cobranças avulsas */}
      {avulsas.length > 0 && (
        <section className="rounded-2xl border border-blue-500/30 bg-blue-500/5 overflow-hidden">
          <div className="border-b border-blue-500/20 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-blue-300">
              Cobranças avulsas
            </h2>
            <p className="text-[11px] text-slate-500">Serviços extras, ajustes ou aditivos cobrados separadamente</p>
          </div>
          <div className="divide-y divide-white/5">
            {avulsas.map(c => {
              const podePagar = c.status === "aberta" || c.status === "atrasada";
              return (
                <div key={c.id} className="p-4 flex items-center gap-3 flex-wrap">
                  <Receipt className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{c.nome}</p>
                    {c.motivo && <p className="text-xs text-slate-400">{c.motivo}</p>}
                    <p className="text-xs text-slate-500">Venc. {fmtData(c.vencimento)}</p>
                  </div>
                  <p className="text-base font-bold text-white">{fmtBRL(c.valor)}</p>
                  <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${
                    c.status === "paga" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" :
                    c.status === "atrasada" ? "border-red-500/30 bg-red-500/10 text-red-300" :
                    "border-blue-500/30 bg-blue-500/10 text-blue-300"
                  }`}>
                    {c.status}
                  </span>
                  {podePagar && (
                    <button onClick={() => pagarAvulsa(c.id)} disabled={pagandoId !== null}
                      className="flex items-center gap-1 rounded-xl bg-brand hover:opacity-90 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                      {pagandoId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                      Pagar
                    </button>
                  )}
                  {c.status === "paga" && (
                    <a href={`/api/painel/mensalidades/${c.id}/comprovante?tipo=avulsa`} target="_blank" rel="noopener"
                      className="flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Comprovante
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default function MensalidadesPage() {
  return (
    <Suspense fallback={<div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>}>
      <MensalidadesContent />
    </Suspense>
  );
}
