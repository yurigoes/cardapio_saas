"use client";

/**
 * /admin/financeiro/mensalidades — master vê todas mensalidades.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Receipt, RefreshCw, Loader2, Filter, Send, CheckCircle2, XCircle,
  ExternalLink, ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { alertar, confirmar } from "@/components/ui/ConfirmModal";

interface Mensalidade {
  id:             string;
  empresa_id:     string;
  empresa_nome:   string;
  email:          string | null;
  mes_referencia: string;
  valor:          number;
  vencimento:     string;
  status:         "aberta" | "paga" | "atrasada" | "cancelada" | "isenta";
  pago_em:        string | null;
  pago_via:       string | null;
  mp_init_point:  string | null;
  plano_nome:     string | null;
}

interface Totais {
  total_aberto:   string;
  total_paga:     string;
  total_atrasada: string;
  qtd_aberto:     string;
  qtd_paga:       string;
  qtd_atrasada:   string;
}

const STATUS_BADGE: Record<Mensalidade["status"], { label: string; cor: string }> = {
  aberta:    { label: "Aberta",    cor: "border-blue-500/30 bg-blue-500/10 text-blue-300" },
  paga:      { label: "Paga",      cor: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  atrasada:  { label: "Atrasada",  cor: "border-red-500/30 bg-red-500/10 text-red-300" },
  cancelada: { label: "Cancelada", cor: "border-slate-500/30 bg-slate-500/10 text-slate-300" },
  isenta:    { label: "Isenta",    cor: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
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

export default function MensalidadesAdminPage() {
  const [list, setList]       = useState<Mensalidade[]>([]);
  const [totais, setTotais]   = useState<Totais | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus]   = useState("");
  const [mes, setMes]         = useState("");
  const [acaoBusy, setAcaoBusy] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (status) sp.set("status", status);
      if (mes)    sp.set("mes", mes);
      const r = await fetch(`/api/admin/mensalidades?${sp}`, { headers: authHeader() });
      const d = await r.json();
      if (d.success) {
        setList(d.data.mensalidades ?? []);
        setTotais(d.data.totais ?? null);
      }
    } finally { setLoading(false); }
  }, [status, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  async function acao(id: string, tipo: "reenviar_email" | "marcar_paga" | "cancelar") {
    if (tipo === "marcar_paga") {
      const ok = await confirmar({
        titulo: "Marcar como paga manualmente?",
        mensagem: "Use só se já recebeu o pagamento por outro meio.",
        okLabel: "Marcar paga", perigo: true,
      });
      if (!ok) return;
    }
    if (tipo === "cancelar") {
      const ok = await confirmar({
        titulo: "Cancelar fatura?",
        mensagem: "Marca como cancelada (não cobra mais).",
        okLabel: "Cancelar fatura", perigo: true,
      });
      if (!ok) return;
    }

    setAcaoBusy(`${id}-${tipo}`);
    try {
      const r = await fetch(`/api/admin/mensalidades/${id}/acoes`, {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ acao: tipo }),
      });
      const d = await r.json();
      if (d.success) {
        await alertar({ titulo: "Ação realizada", mensagem: d.data?.mensagem ?? "OK", tipo: "sucesso" });
        carregar();
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "?", tipo: "perigo" });
      }
    } finally { setAcaoBusy(null); }
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Receipt className="h-5 w-5 text-emerald-400" /> Mensalidades das empresas
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Faturas mensais geradas pela cron + cobrança via Mercado Pago
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/billing"
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
            <ArrowLeft className="h-3.5 w-3.5" /> Config MP
          </Link>
          <button onClick={carregar} disabled={loading}
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* Cards totalizadores */}
      {totais && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
            <p className="text-xs uppercase tracking-wider text-blue-300">Em aberto</p>
            <p className="mt-2 text-2xl font-black text-white">{fmtBRL(totais.total_aberto)}</p>
            <p className="text-xs text-slate-500 mt-1">{totais.qtd_aberto} fatura(s)</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-xs uppercase tracking-wider text-emerald-300">Pago</p>
            <p className="mt-2 text-2xl font-black text-white">{fmtBRL(totais.total_paga)}</p>
            <p className="text-xs text-slate-500 mt-1">{totais.qtd_paga} fatura(s)</p>
          </div>
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-xs uppercase tracking-wider text-red-300">Atrasado</p>
            <p className="mt-2 text-2xl font-black text-white">{fmtBRL(totais.total_atrasada)}</p>
            <p className="text-xs text-slate-500 mt-1">{totais.qtd_atrasada} fatura(s)</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        <Filter className="h-4 w-4 text-slate-500" />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white">
          <option value="">Todos status</option>
          <option value="aberta">Aberta</option>
          <option value="paga">Paga</option>
          <option value="atrasada">Atrasada</option>
          <option value="cancelada">Cancelada</option>
          <option value="isenta">Isenta</option>
        </select>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white" />
        {(status || mes) && (
          <button onClick={() => { setStatus(""); setMes(""); }}
            className="text-xs text-slate-500 hover:text-white">Limpar</button>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading && list.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Nenhuma mensalidade nesse filtro</p>
        ) : (
          <div className="divide-y divide-white/5">
            {list.map(m => {
              const cfg = STATUS_BADGE[m.status];
              return (
                <div key={m.id} className="p-3 grid grid-cols-12 gap-2 text-xs items-center">
                  <div className="col-span-3 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{m.empresa_nome}</p>
                    {m.plano_nome && <p className="text-[10px] text-slate-500 truncate">{m.plano_nome}</p>}
                    {m.email && <p className="text-[10px] text-slate-500 truncate">{m.email}</p>}
                  </div>
                  <div className="col-span-2 text-slate-400">
                    <p>Ref: {fmtData(m.mes_referencia)}</p>
                    <p>Venc: {fmtData(m.vencimento)}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-base font-bold text-white">{fmtBRL(m.valor)}</p>
                    {m.pago_via && <p className="text-[10px] text-slate-500">via {m.pago_via}</p>}
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold ${cfg.cor}`}>
                      {cfg.label}
                    </span>
                    {m.pago_em && (
                      <p className="mt-1 text-[10px] text-emerald-400">↗ {fmtData(m.pago_em)}</p>
                    )}
                  </div>
                  <div className="col-span-3 flex justify-end gap-1">
                    {m.mp_init_point && (
                      <a href={m.mp_init_point} target="_blank" rel="noopener"
                        title="Ver checkout" className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {m.status !== "paga" && m.status !== "cancelada" && (
                      <>
                        <button onClick={() => acao(m.id, "reenviar_email")}
                          disabled={acaoBusy !== null} title="Reenviar email"
                          className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-blue-400 disabled:opacity-30">
                          {acaoBusy === `${m.id}-reenviar_email` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => acao(m.id, "marcar_paga")}
                          disabled={acaoBusy !== null} title="Marcar como paga"
                          className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-emerald-400 disabled:opacity-30">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => acao(m.id, "cancelar")}
                          disabled={acaoBusy !== null} title="Cancelar"
                          className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-red-400 disabled:opacity-30">
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
