"use client";

/**
 * /painel/vales — gestão de crediário (vale a prazo)
 */
import { useEffect, useState, useCallback } from "react";
import {
  Wallet, RefreshCw, Filter, X, CheckCircle2, Clock,
  AlertCircle, Search, Plus, Loader2,
} from "lucide-react";

interface Vale {
  id:                string;
  valor:             string;
  valor_quitado:     string;
  status:            "aberto" | "parcial" | "quitado" | "cancelado";
  data_vencimento:   string | null;
  observacoes:       string | null;
  pedido_id:         string | null;
  pedido_numero:     number | null;
  cliente_id:        string;
  cliente_nome:      string | null;
  cliente_telefone:  string | null;
  limite_vale:       string;
  saldo_vale_aberto: string;
  created_at:        string;
}

const STATUS_INFO = {
  aberto:    { label: "Aberto",    color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  parcial:   { label: "Parcial",   color: "bg-blue-500/15 text-blue-400 border-blue-500/30"     },
  quitado:   { label: "Quitado",   color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelado: { label: "Cancelado", color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

const fmtBRL = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export default function ValesPage() {
  const [rows, setRows]     = useState<Vale[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]     = useState(1);
  const [q, setQ]           = useState("");
  const [status, setStatus] = useState("aberto,parcial");
  const [quitarVale, setQuitarVale] = useState<Vale | null>(null);

  const carregar = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const t  = localStorage.getItem("access_token") ?? "";
      const sp = new URLSearchParams({ page: String(p), limit: "50" });
      if (q)      sp.set("q", q);
      if (status && !status.includes(",")) sp.set("status", status);
      const r = await fetch(`/api/painel/vales?${sp}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const d = await r.json();
      if (d.success) {
        let items: Vale[] = d.data ?? [];
        // Filtro multi-status no client
        if (status.includes(",")) {
          const allow = status.split(",");
          items = items.filter(v => allow.includes(v.status));
        }
        setRows(items);
        setTotal(d.meta?.pagination?.total ?? items.length);
        setPage(p);
      }
    } finally { setLoading(false); }
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(() => carregar(1), 300);
    return () => clearTimeout(t);
  }, [carregar]);

  // Totais
  const totalAberto = rows
    .filter(v => v.status === "aberto" || v.status === "parcial")
    .reduce((a, v) => a + (Number(v.valor) - Number(v.valor_quitado)), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Wallet className="h-5 w-5 text-amber-400" />
            Vales / Crediário
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {total} vale{total !== 1 ? "s" : ""} · {fmtBRL(totalAberto)} em aberto (página atual)
          </p>
        </div>
        <button
          onClick={() => carregar(page)}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Cliente / telefone"
              className="w-full rounded-lg border border-white/10 bg-slate-800 py-2 pl-8 pr-3 text-sm text-white focus:border-amber-500/50 focus:outline-none"
            />
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-amber-500/50 focus:outline-none"
          >
            <option value="aberto,parcial">Em aberto (todos)</option>
            <option value="aberto">Apenas abertos</option>
            <option value="parcial">Apenas parciais</option>
            <option value="quitado">Quitados</option>
            <option value="cancelado">Cancelados</option>
            <option value="">Todos status</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Nenhum vale encontrado
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map(v => {
              const st       = STATUS_INFO[v.status];
              const restante = Number(v.valor) - Number(v.valor_quitado);
              const podeQuitar = v.status === "aberto" || v.status === "parcial";
              return (
                <div key={v.id} className="flex items-start gap-3 p-4 hover:bg-white/5 transition">
                  <div className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase flex-shrink-0 ${st.color}`}>
                    {st.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-semibold text-white truncate">
                        {v.cliente_nome ?? "(sem nome)"}
                      </span>
                      {v.cliente_telefone && (
                        <span className="text-[11px] text-slate-500">{v.cliente_telefone}</span>
                      )}
                      {v.pedido_numero && (
                        <span className="text-[11px] font-mono text-slate-500">#{v.pedido_numero}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs">
                      <span className="text-slate-300">
                        Valor: <span className="font-mono text-white">{fmtBRL(v.valor)}</span>
                      </span>
                      {Number(v.valor_quitado) > 0 && (
                        <span className="text-emerald-400">
                          Pago: <span className="font-mono">{fmtBRL(v.valor_quitado)}</span>
                        </span>
                      )}
                      {podeQuitar && (
                        <span className="text-amber-400">
                          Falta: <span className="font-mono font-bold">{fmtBRL(restante)}</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-600">
                      Criado {fmtDate(v.created_at)}
                      {v.data_vencimento && ` · vence ${fmtDate(v.data_vencimento)}`}
                      {v.observacoes && ` · ${v.observacoes}`}
                    </div>
                  </div>
                  {podeQuitar && (
                    <button
                      onClick={() => setQuitarVale(v)}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition flex-shrink-0"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de quitação */}
      {quitarVale && (
        <QuitarValeModal
          vale={quitarVale}
          onClose={() => setQuitarVale(null)}
          onDone={() => { setQuitarVale(null); carregar(page); }}
        />
      )}
    </div>
  );
}

// ── Modal Quitar Vale ────────────────────────────────────────────────────────

function QuitarValeModal({ vale, onClose, onDone }: {
  vale: Vale; onClose: () => void; onDone: () => void;
}) {
  const restante = Number(vale.valor) - Number(vale.valor_quitado);
  const [valor, setValor] = useState(restante.toFixed(2));
  const [forma, setForma] = useState<"pix"|"dinheiro"|"credito"|"debito"|"outro">("pix");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function quitar() {
    setSaving(true); setErro(null);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch(`/api/painel/vales/${vale.id}/quitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          valor: parseFloat(valor),
          forma_pagamento: forma,
          observacoes: obs || undefined,
        }),
      });
      const d = await r.json();
      if (!d.success) { setErro(d.error?.message ?? "Falha"); return; }
      onDone();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Quitar vale</h2>
            <p className="text-xs text-slate-400 mt-0.5">{vale.cliente_nome ?? "(sem nome)"}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 mb-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-amber-400">Falta pagar</p>
          <p className="text-3xl font-bold text-white mt-1">{fmtBRL(restante)}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Valor recebido</label>
            <input
              type="number" step="0.01" min="0.01" max={restante}
              value={valor} onChange={e => setValor(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-base text-white text-right font-mono focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Forma de pagamento</label>
            <select
              value={forma} onChange={e => setForma(e.target.value as typeof forma)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="pix">PIX</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="credito">Cartão de crédito</option>
              <option value="debito">Cartão de débito</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Observações (opcional)</label>
            <input
              value={obs} onChange={e => setObs(e.target.value)}
              placeholder="Ex: pagamento parcial, recibo emitido…"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
        </div>

        {erro && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
            {erro}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition"
          >
            Cancelar
          </button>
          <button
            onClick={quitar}
            disabled={saving || !valor || parseFloat(valor) <= 0}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-40 transition"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
