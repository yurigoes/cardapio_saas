"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Shield, Download, Trash2, AlertTriangle, ExternalLink, Mail,
  Loader2, Check,
} from "lucide-react";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";
import { useSaasBranding } from "@/lib/hooks/useSaasBranding";

export default function LgpdPage() {
  const branding = useSaasBranding();
  const [exportando, setExportando] = useState(false);
  const [excluindo, setExcluindo]   = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function exportar() {
    setExportando(true);
    setResultado(null);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch("/api/painel/lgpd/exportar", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setResultado({ ok: false, texto: `Falha: ${d.error?.message ?? d.error ?? r.statusText}` });
        return;
      }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `cardapio-export-${Date.now()}.json.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setResultado({ ok: true, texto: "✓ Download iniciado. Arquivo .json.gz com todos os dados da empresa." });
    } finally { setExportando(false); }
  }

  async function excluir() {
    if (!confirmacao.trim()) { await alertar({ titulo: "Confirmação obrigatória", mensagem: "Digite o slug da empresa pra confirmar.", tipo: "alerta" }); return; }
    if (!await confirmar({ titulo: "ÚLTIMA CONFIRMAÇÃO", mensagem: "Vai SUSPENDER o acesso imediatamente e EXCLUIR DEFINITIVAMENTE em 30 dias.\n\nProsseguir?", okLabel: "Suspender e agendar exclusão", perigo: true })) return;
    setExcluindo(true);
    setResultado(null);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch("/api/painel/lgpd/excluir-conta", {
        method:  "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ confirmacao: confirmacao.trim() }),
      });
      const d = await r.json();
      if (d.success) {
        setResultado({ ok: true, texto: d.data.mensagem ?? "Conta suspensa." });
        // Limpa sessão e redireciona em 5s
        setTimeout(() => {
          localStorage.clear();
          window.location.href = "/login";
        }, 5000);
      } else {
        setResultado({ ok: false, texto: d.error?.message ?? d.error ?? "Falha" });
      }
    } finally { setExcluindo(false); }
  }

  return (
    <div className="space-y-6 pb-12 max-w-3xl">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-emerald-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Privacidade e seus dados (LGPD)</h1>
          <p className="text-sm text-slate-400">
            Exerça os direitos garantidos pela Lei Geral de Proteção de Dados.
          </p>
        </div>
      </div>

      {resultado && (
        <div className={`rounded-xl border p-4 ${
          resultado.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                       : "border-red-500/30 bg-red-500/10 text-red-200"
        }`}>
          <pre className="whitespace-pre-wrap text-sm">{resultado.texto}</pre>
        </div>
      )}

      {/* Exportar dados */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-white">
          <Download className="h-5 w-5 text-emerald-400" />
          Exportar meus dados
        </h2>
        <p className="text-sm text-slate-400">
          Baixe um arquivo <code>.json.gz</code> com TODOS os dados da empresa:
          usuários, produtos, pedidos, clientes, mesas, caixas, vales, etc.
          Útil pra backup pessoal ou migração.
        </p>
        <button onClick={exportar} disabled={exportando}
          className="rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 px-4 py-2.5 text-sm font-bold text-white inline-flex items-center gap-2">
          {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exportando ? "Gerando..." : "Baixar todos os dados"}
        </button>
      </section>

      {/* Outros direitos */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-2 text-sm">
        <h2 className="font-bold text-white text-base mb-2">Outros direitos LGPD</h2>
        <p className="text-slate-300">
          <strong>Corrigir dados:</strong> edite no <Link href="/painel/config" className="text-emerald-400">Configurações</Link>
          {" "}e <Link href="/painel/usuarios" className="text-emerald-400">Usuários</Link>.
        </p>
        <p className="text-slate-300">
          <strong>Acessar logs de uso:</strong> em <Link href="/painel/auditoria" className="text-emerald-400">Auditoria</Link>.
        </p>
        <p className="text-slate-300">
          <strong>Política completa:</strong>{" "}
          <Link href="/privacidade" className="text-emerald-400 inline-flex items-center gap-1">
            ver Política de Privacidade <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
        {(branding.dpo_email || branding.email) && (
          <p className="text-slate-300">
            <strong>Encarregado (DPO){branding.dpo_nome ? `: ${branding.dpo_nome}` : ""}:</strong>{" "}
            <a href={`mailto:${branding.dpo_email ?? branding.email}`} className="text-emerald-400 inline-flex items-center gap-1">
              <Mail className="h-3 w-3" /> {branding.dpo_email ?? branding.email}
            </a>
            {branding.dpo_telefone && <span className="text-slate-400"> · {branding.dpo_telefone}</span>}
          </p>
        )}
      </section>

      {/* Excluir conta — zona de perigo */}
      <section className="rounded-2xl border border-red-500/40 bg-red-500/5 p-5 space-y-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-red-300">
          <Trash2 className="h-5 w-5" />
          Excluir minha conta
        </h2>
        <div className="flex items-start gap-2 text-sm text-red-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p>Suspende o acesso imediatamente e <strong>exclui todos os dados em 30 dias</strong>.</p>
            <p className="mt-1">Dentro desse prazo dá pra reverter contatando{" "}
              {branding.dpo_email || branding.email ? (
                <a href={`mailto:${branding.dpo_email ?? branding.email}`} className="underline">
                  {branding.dpo_email ?? branding.email}
                </a>
              ) : <span>o suporte</span>}.
              Depois de 30 dias, é definitivo.</p>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300 block">
            Pra confirmar, digite o <strong>slug da empresa</strong> (URL que você escolheu no cadastro):
          </label>
          <input
            value={confirmacao}
            onChange={e => setConfirmacao(e.target.value)}
            placeholder="ex: meu-restaurante"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm font-mono text-white"
          />
        </div>
        <button onClick={excluir} disabled={excluindo || !confirmacao.trim()}
          className="rounded-xl bg-red-500 hover:bg-red-400 disabled:opacity-40 px-4 py-2.5 text-sm font-bold text-white inline-flex items-center gap-2">
          {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {excluindo ? "Solicitando..." : "Excluir minha conta"}
        </button>
      </section>
    </div>
  );
}
