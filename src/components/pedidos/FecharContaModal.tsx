"use client";

/**
 * FecharContaModal — divisão de pagamento ao fechar pedido.
 *
 * Operador adiciona N pagamentos (forma + valor). Soma deve igualar total.
 * Botão "Imprimir conta" abre /imprimir/pedido/[id] em nova aba antes de finalizar.
 *
 * Uso:
 *   <FecharContaModal pedido={pedido} open={open} onClose={...} onClosed={...} />
 */
import { useState, useMemo } from "react";
import {
  X, Plus, Trash2, Printer, CheckCircle2, Loader2,
  Banknote, CreditCard, QrCode, Wallet, MoreHorizontal,
} from "lucide-react";

export type FormaPagamento = "pix" | "dinheiro" | "credito" | "debito" | "vale" | "outro";

interface PedidoMin {
  id:     string;
  numero: number | null;
  total:  number;
  mesa_numero?: number | null;
  cliente_nome?: string | null;
}

interface PagamentoLinha {
  forma:        FormaPagamento;
  valor:        string;          // string pra UI (input controlado)
  troco_para?:  string;
  observacoes?: string;
}

const FORMAS_INFO: Record<FormaPagamento, { label: string; icon: React.ElementType; color: string }> = {
  pix:      { label: "PIX",      icon: QrCode,           color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  dinheiro: { label: "Dinheiro", icon: Banknote,         color: "text-green-400  bg-green-500/10  border-green-500/30"   },
  credito:  { label: "Crédito",  icon: CreditCard,       color: "text-blue-400   bg-blue-500/10   border-blue-500/30"    },
  debito:   { label: "Débito",   icon: CreditCard,       color: "text-cyan-400   bg-cyan-500/10   border-cyan-500/30"    },
  vale:     { label: "Vale",     icon: Wallet,           color: "text-amber-400  bg-amber-500/10  border-amber-500/30"   },
  outro:    { label: "Outro",    icon: MoreHorizontal,   color: "text-slate-400  bg-slate-500/10  border-slate-500/30"   },
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Props {
  pedido:    PedidoMin;
  open:      boolean;
  onClose:   () => void;
  onClosed:  () => void;
  authToken: string;
}

export function FecharContaModal({ pedido, open, onClose, onClosed, authToken }: Props) {
  const [pagamentos, setPagamentos] = useState<PagamentoLinha[]>([
    { forma: "pix", valor: pedido.total.toFixed(2) },
  ]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro]     = useState<string | null>(null);

  const totalPago = useMemo(
    () => pagamentos.reduce((a, p) => a + (parseFloat(p.valor) || 0), 0),
    [pagamentos]
  );
  const diff      = totalPago - pedido.total;
  const podeFechar = Math.abs(diff) <= 0.02;

  function setLinha(i: number, patch: Partial<PagamentoLinha>) {
    setPagamentos(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function adicionar() {
    const restante = Math.max(0, pedido.total - totalPago);
    setPagamentos(prev => [...prev, { forma: "dinheiro", valor: restante.toFixed(2) }]);
  }
  function remover(i: number) {
    setPagamentos(prev => prev.filter((_, idx) => idx !== i));
  }

  async function imprimir() {
    // Pra delivery: envia conta via WhatsApp (não imprime)
    // Pra mesa/balcão: imprime no caixa via agente local
    const ehDelivery = pedido.tipo === "delivery";
    const url = ehDelivery
      ? `/api/painel/pedidos/${pedido.id}/enviar-conta`
      : `/api/painel/pedidos/${pedido.id}/imprimir`;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(ehDelivery ? {} : { tipo: "cliente" }),
      });
      const d = await r.json();
      if (!d.success) {
        alert(d.error?.message ?? (ehDelivery ? "Falha ao enviar WhatsApp" : "Falha ao enviar pra impressora"));
      } else if (ehDelivery) {
        alert(d.data.mensagem ?? "Conta enviada pelo WhatsApp do cliente");
      }
    } catch (e) {
      alert("Falha de rede");
    }
  }

  async function fechar() {
    if (!podeFechar) {
      setErro(`Soma dos pagamentos (${fmtBRL(totalPago)}) não bate com o total ${fmtBRL(pedido.total)}.`);
      return;
    }
    setSaving(true);
    setErro(null);
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}/fechar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body:   JSON.stringify({
          pagamentos: pagamentos.map(p => ({
            forma:       p.forma,
            valor:       parseFloat(p.valor),
            troco_para:  p.troco_para  ? parseFloat(p.troco_para) : undefined,
            observacoes: p.observacoes || undefined,
          })),
        }),
      });
      const d = await res.json();
      if (!d.success) {
        setErro(d.error?.message ?? "Falha ao fechar conta");
        return;
      }
      onClosed();
    } finally { setSaving(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-5 py-4 z-10">
          <div>
            <h2 className="text-lg font-bold text-white">Fechar conta</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Pedido #{pedido.numero ?? pedido.id.slice(0, 6)}
              {pedido.mesa_numero ? ` · Mesa ${pedido.mesa_numero}` : ""}
              {pedido.cliente_nome ? ` · ${pedido.cliente_nome}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Total */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
            <p className="text-[10px] uppercase tracking-wider text-emerald-400">Total a pagar</p>
            <p className="mt-1 text-4xl font-bold text-white">{fmtBRL(pedido.total)}</p>
          </div>

          {/* Linhas de pagamento */}
          <div className="space-y-3">
            {pagamentos.map((p, i) => {
              const info = FORMAS_INFO[p.forma];
              const Icon = info.icon;
              return (
                <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${info.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <select
                      value={p.forma}
                      onChange={e => setLinha(i, { forma: e.target.value as FormaPagamento })}
                      className="flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                    >
                      {(Object.keys(FORMAS_INFO) as FormaPagamento[]).map(f => (
                        <option key={f} value={f}>{FORMAS_INFO[f].label}</option>
                      ))}
                    </select>
                    <input
                      type="number" step="0.01" min="0.01"
                      value={p.valor}
                      onChange={e => setLinha(i, { valor: e.target.value })}
                      placeholder="0,00"
                      className="w-32 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white text-right font-mono focus:border-emerald-500/50 focus:outline-none"
                    />
                    {pagamentos.length > 1 && (
                      <button
                        onClick={() => remover(i)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {p.forma === "dinheiro" && (
                    <div className="flex items-center gap-2 pl-11">
                      <span className="text-[11px] text-slate-500">Trocar para:</span>
                      <input
                        type="number" step="0.01"
                        value={p.troco_para ?? ""}
                        onChange={e => setLinha(i, { troco_para: e.target.value })}
                        placeholder={p.valor || "0,00"}
                        className="w-28 rounded border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white text-right font-mono"
                      />
                      {p.troco_para && parseFloat(p.troco_para) > parseFloat(p.valor || "0") && (
                        <span className="text-xs text-emerald-400 font-bold">
                          Troco: {fmtBRL(parseFloat(p.troco_para) - parseFloat(p.valor || "0"))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={adicionar}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/5 py-3 text-xs font-medium text-slate-400 hover:border-emerald-500/40 hover:text-emerald-400 transition"
            >
              <Plus className="h-4 w-4" />
              Adicionar outro pagamento (dividir conta)
            </button>
          </div>

          {/* Resumo */}
          <div className="rounded-xl border border-white/10 bg-slate-950 p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Total do pedido</span>
              <span className="font-mono">{fmtBRL(pedido.total)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Total recebido</span>
              <span className="font-mono">{fmtBRL(totalPago)}</span>
            </div>
            <div className={`flex justify-between font-bold pt-1.5 border-t border-white/10 ${
              Math.abs(diff) <= 0.02 ? "text-emerald-400"
              : diff > 0 ? "text-amber-400"
              : "text-red-400"
            }`}>
              <span>{diff > 0 ? "Excedente" : diff < 0 ? "Falta" : "Conferido"}</span>
              <span className="font-mono">{fmtBRL(Math.abs(diff))}</span>
            </div>
          </div>

          {erro && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-white/10 bg-slate-900 p-4">
          <button
            onClick={imprimir}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10 transition"
          >
            <Printer className="h-4 w-4" />
            {pedido.tipo === "delivery" ? "Enviar conta WhatsApp" : "Imprimir conta"}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition"
          >
            Cancelar
          </button>
          <button
            onClick={fechar}
            disabled={!podeFechar || saving}
            className="ml-auto flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmar e fechar
          </button>
        </div>
      </div>
    </div>
  );
}
