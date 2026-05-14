"use client";

/**
 * /admin/manutencao — master broadcast de aviso de manutenção via e-mail.
 *
 * Reutiliza o template "manutencao_aviso" + envia pra TODAS empresas
 * ativas/teste com email cadastrado.
 */
import { useState } from "react";
import {
  Wrench, Send, Loader2, AlertTriangle, Eye, CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { alertar, confirmar } from "@/components/ui/ConfirmModal";

function authHeader(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

export default function ManutencaoPage() {
  const [form, setForm] = useState({
    inicio:   "",
    duracao:  "30 min",
    impacto:  "Painel pode ficar inacessível durante a janela. Pedidos em andamento são preservados.",
    detalhes: "",
  });
  const [enviando, setEnviando]   = useState(false);
  const [resultado, setResultado] = useState<{ total_empresas: number; enfileirados: number; pulados_dup: number; mensagem: string } | null>(null);

  async function preview() {
    const r = await fetch("/api/admin/manutencao/avisar", {
      method: "POST", headers: authHeader(),
      body: JSON.stringify({ ...form, apenas_teste: true }),
    });
    const d = await r.json();
    if (d.success) {
      await alertar({
        titulo:   "Preview",
        mensagem: d.data?.mensagem ?? "?",
        tipo:     "info",
      });
    } else {
      await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
    }
  }

  async function enviar() {
    if (!form.inicio.trim() || !form.duracao.trim() || !form.impacto.trim()) {
      await alertar({ titulo: "Campos obrigatórios", mensagem: "Preencha início, duração e impacto.", tipo: "alerta" });
      return;
    }
    if (!await confirmar({
      titulo: "Disparar broadcast?",
      mensagem: "Vai enviar e-mail pra TODAS empresas operacionais com endereço cadastrado. Anti-duplicação: pula empresas já avisadas nas últimas 6h.",
      okLabel: "Disparar",
      perigo:  true,
    })) return;

    setEnviando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/admin/manutencao/avisar", {
        method: "POST", headers: authHeader(),
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.success) {
        setResultado(d.data);
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
      }
    } finally { setEnviando(false); }
  }

  return (
    <div className="space-y-6 max-w-3xl pb-12">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <Wrench className="h-5 w-5 text-amber-400" /> Manutenção · Aviso broadcast
        </h1>
        <p className="mt-0.5 text-sm text-slate-400">
          Envia e-mail pra todas as empresas avisando de janela de manutenção programada.
          Usa o template <code className="text-slate-500">manutencao_aviso</code>{" "}
          (<Link href="/admin/email/templates" className="text-emerald-400">editar</Link>).
        </p>
      </div>

      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-200">
          <strong>Diferente do modo manutenção</strong> (que bloqueia POST /api/pedidos).
          Esse é só um aviso por e-mail — você ainda precisa ativar o modo manutenção
          em <Link href="/admin/vps" className="underline">/admin/vps</Link> quando começar a janela.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-400 mb-1 block">Início *</span>
          <input value={form.inicio}
            onChange={e => setForm({ ...form, inicio: e.target.value })}
            placeholder="15/05 às 02h BRT (terça-feira)"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Duração estimada *</span>
            <input value={form.duracao}
              onChange={e => setForm({ ...form, duracao: e.target.value })}
              placeholder="30 min"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Impacto resumido *</span>
            <input value={form.impacto}
              onChange={e => setForm({ ...form, impacto: e.target.value })}
              placeholder="Painel inacessível"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-400 mb-1 block">
            Detalhes técnicos (opcional)
          </span>
          <textarea value={form.detalhes}
            onChange={e => setForm({ ...form, detalhes: e.target.value })}
            rows={3}
            placeholder="Migração de schema, atualização de dependências, etc."
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
        </label>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
          <button onClick={preview}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
            <Eye className="h-4 w-4" /> Preview (quantas empresas)
          </button>
          <button onClick={enviar} disabled={enviando}
            className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50 ml-auto">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {enviando ? "Enviando..." : "Disparar broadcast"}
          </button>
        </div>
      </section>

      {resultado && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <h2 className="font-bold text-white">Broadcast enviado</h2>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-slate-900 p-3 text-center">
              <p className="text-2xl font-black text-white">{resultado.total_empresas}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Total empresas</p>
            </div>
            <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
              <p className="text-2xl font-black text-emerald-300">{resultado.enfileirados}</p>
              <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider mt-1">Enfileirados</p>
            </div>
            <div className="rounded-lg bg-amber-500/10 p-3 text-center">
              <p className="text-2xl font-black text-amber-300">{resultado.pulados_dup}</p>
              <p className="text-[10px] text-amber-400/80 uppercase tracking-wider mt-1">Pulados (dup)</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Os e-mails serão enviados pelo worker SMTP no próximo ciclo (1-2min).
            Acompanhe em <Link href="/admin/email/logs" className="text-emerald-400">/admin/email/logs</Link>.
          </p>
        </section>
      )}
    </div>
  );
}
