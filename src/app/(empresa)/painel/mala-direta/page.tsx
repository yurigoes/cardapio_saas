"use client";

/**
 * /painel/mala-direta — campanhas WhatsApp pra base de clientes.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Mail, Plus, RefreshCw, Send, AlertTriangle, Clock, Check, Loader2, Users,
} from "lucide-react";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";

interface Campanha {
  id: string; nome: string; canal: string; mensagem: string;
  status: string; agendada_para: string | null;
  delay_min_seg: number; delay_max_seg: number;
  total_alvo: number; total_enviado: number; total_falha: number;
  iniciada_em: string | null; concluida_em: string | null;
  created_at: string;
}

const STATUS_COR: Record<string, string> = {
  rascunho:    "bg-slate-700 text-slate-300",
  agendada:    "bg-blue-500/20 text-blue-300",
  enviando:    "bg-amber-500/20 text-amber-300",
  concluida:   "bg-emerald-500/20 text-emerald-300",
  cancelada:   "bg-red-500/20 text-red-300",
};

const fmtData = (iso: string | null) => iso ? new Date(iso).toLocaleString("pt-BR") : "—";

export default function MalaDiretaPage() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading]     = useState(true);
  const [criando, setCriando]     = useState(false);
  const [form, setForm] = useState({
    nome: "", mensagem: "Olá {nome}! 👋\n\n[escreva sua mensagem aqui]",
    delay_min_seg: 10, delay_max_seg: 60,
    aniversario_mes: "", ultima_compra_dias: "",
  });
  const [busy, setBusy] = useState<string | null>(null);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/painel/mala-direta", { headers: auth() });
      const d = await r.json();
      if (d.success) setCampanhas(d.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    carregar();
    const i = setInterval(carregar, 10_000); // refresh pra ver progresso
    return () => clearInterval(i);
  }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    try {
      const filtro: Record<string, unknown> = {};
      if (form.aniversario_mes)    filtro.aniversario_mes    = parseInt(form.aniversario_mes, 10);
      if (form.ultima_compra_dias) filtro.ultima_compra_dias = parseInt(form.ultima_compra_dias, 10);

      const r = await fetch("/api/painel/mala-direta", {
        method: "POST", headers: auth(),
        body: JSON.stringify({
          nome:          form.nome.trim(),
          canal:         "whatsapp",
          mensagem:      form.mensagem,
          delay_min_seg: form.delay_min_seg,
          delay_max_seg: form.delay_max_seg,
          filtro,
        }),
      });
      const d = await r.json();
      if (d.success) {
        await alertar({ titulo: "Campanha criada", mensagem: d.data.mensagem, tipo: "sucesso" });
        setForm({ ...form, nome: "" });
        carregar();
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
      }
    } finally { setCriando(false); }
  }

  async function iniciar(c: Campanha) {
    if (!await confirmar({ titulo: "Iniciar envio da campanha?", mensagem: `"${c.nome}" será enviada para ${c.total_alvo} pessoa(s).`, okLabel: "Iniciar envio" })) return;
    setBusy(c.id);
    try {
      const r = await fetch(`/api/painel/mala-direta/${c.id}/iniciar`, {
        method: "POST", headers: auth(),
      });
      const d = await r.json();
      if (d.success) {
        await alertar({ titulo: "Envio iniciado", mensagem: d.data.mensagem, tipo: "sucesso" });
        carregar();
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
      }
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Mail className="h-5 w-5 text-emerald-400" />
            Mala direta
          </h1>
          <p className="text-sm text-slate-400">
            Campanhas via WhatsApp com delay anti-bloqueio
          </p>
        </div>
        <button onClick={carregar}
          className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
          <RefreshCw className={`h-3.5 w-3.5 inline ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Form criar */}
      <form onSubmit={criar} className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Nova campanha
        </h2>

        <Field label="Nome interno" required>
          <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            required minLength={2} className="input"
            placeholder="Ex: Black Friday 2026" />
        </Field>

        <Field label="Mensagem" hint="Use {nome} pra personalizar com o nome do cliente" required>
          <textarea value={form.mensagem} onChange={e => setForm(f => ({ ...f, mensagem: e.target.value }))}
            required minLength={5} rows={5} className="input font-mono" />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Filtro: aniversariantes do mês">
            <select value={form.aniversario_mes}
              onChange={e => setForm(f => ({ ...f, aniversario_mes: e.target.value }))}
              className="input">
              <option value="">Todos</option>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m =>
                <option key={m} value={m}>{m.toString().padStart(2,"0")}</option>
              )}
            </select>
          </Field>
          <Field label="Filtro: comprou nos últimos N dias">
            <input type="number" min="1" value={form.ultima_compra_dias}
              onChange={e => setForm(f => ({ ...f, ultima_compra_dias: e.target.value }))}
              placeholder="ex: 30" className="input" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Delay mínimo (segundos)" hint="Anti-bloqueio WhatsApp">
            <input type="number" min="1" max="600" required value={form.delay_min_seg}
              onChange={e => setForm(f => ({ ...f, delay_min_seg: parseInt(e.target.value, 10) || 10 }))}
              className="input" />
          </Field>
          <Field label="Delay máximo (segundos)">
            <input type="number" min="1" max="600" required value={form.delay_max_seg}
              onChange={e => setForm(f => ({ ...f, delay_max_seg: parseInt(e.target.value, 10) || 60 }))}
              className="input" />
          </Field>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            WhatsApp pode bloquear a conta se enviar muito rápido. Recomendado: delay {">"} 10s entre envios.
            Pra 100 contatos com delay 10-60s, a campanha demora ~1h.
          </span>
        </div>

        <button type="submit" disabled={criando}
          className="rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 px-6 py-2.5 text-sm font-bold text-white inline-flex items-center gap-2">
          {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {criando ? "Criando..." : "Criar campanha"}
        </button>
      </form>

      {/* Lista */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
          Campanhas ({campanhas.length})
        </h2>
        {campanhas.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-12 rounded-xl border border-white/10 bg-white/5">
            Nenhuma campanha criada ainda
          </p>
        ) : (
          <div className="space-y-3">
            {campanhas.map(c => {
              const progresso = c.total_alvo > 0 ? Math.round(((c.total_enviado + c.total_falha) / c.total_alvo) * 100) : 0;
              return (
                <div key={c.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white">{c.nome}</p>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_COR[c.status] ?? "bg-slate-700"}`}>
                          {c.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 truncate">{c.mensagem.slice(0, 100)}...</p>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {c.total_alvo} alvos</span>
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {c.delay_min_seg}-{c.delay_max_seg}s</span>
                        <span>criada {fmtData(c.created_at)}</span>
                      </div>
                    </div>
                    {c.status === "rascunho" && (
                      <button onClick={() => iniciar(c)} disabled={busy === c.id}
                        className="rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white inline-flex items-center gap-1 flex-shrink-0">
                        {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Iniciar
                      </button>
                    )}
                  </div>

                  {(c.status === "enviando" || c.status === "concluida") && (
                    <div>
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className={`h-full ${c.status === "concluida" ? "bg-emerald-500" : "bg-amber-500"}`}
                          style={{ width: `${Math.min(100, progresso)}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {c.total_enviado} enviado(s) · {c.total_falha} falha(s) · {progresso}%
                        {c.concluida_em && <span className="text-emerald-400"> · concluída {fmtData(c.concluida_em)}</span>}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          background: rgb(30 41 59);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 0.5rem;
          padding: 0.625rem 0.75rem;
          color: white;
          font-size: 0.875rem;
        }
        :global(.input:focus) {
          outline: none;
          border-color: rgba(16,185,129,0.5);
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-400 mb-1 block">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      {children}
      {hint && <span className="text-[10px] text-slate-500 block mt-1">{hint}</span>}
    </label>
  );
}
