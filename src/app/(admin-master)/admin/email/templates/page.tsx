"use client";

/**
 * /admin/email/templates — editor visual de templates.
 *
 * Lista templates, permite editar HTML/assunto/texto, ativar/desativar,
 * preview com vars dummy.
 */
import { useEffect, useState, useCallback } from "react";
import {
  FileText, Save, Loader2, Eye, ToggleLeft, ToggleRight,
  ArrowLeft, Code, Send,
} from "lucide-react";
import Link from "next/link";
import { alertar } from "@/components/ui/ConfirmModal";

interface Template {
  id:        string;
  evento:    string;
  assunto:   string;
  html:      string;
  texto:     string | null;
  ativo:     boolean;
  descricao: string | null;
  variaveis: string[];
  updated_at: string;
}

function authHeader(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

const EVENTO_LABELS: Record<string, string> = {
  boas_vindas:      "Boas-vindas (cadastro)",
  reset_senha:      "Recuperação de senha",
  pagamento_ok:     "Pagamento confirmado",
  pagamento_falhou: "Pagamento falhou",
  trial_expirando:  "Trial expirando",
  manutencao_aviso: "Manutenção programada",
};

export default function TemplatesPage() {
  const [list, setList]       = useState<Template[]>([]);
  const [sel, setSel]         = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [destinoTeste, setDestinoTeste] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/email/templates", { headers: authHeader() });
      const d = await r.json();
      if (d.success) {
        const arr: Template[] = d.data ?? [];
        setList(arr);
        if (arr.length > 0 && !sel) setSel(arr[0]);
      }
    } finally { setLoading(false); }
  }, [sel]);

  useEffect(() => { carregar(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  async function salvar() {
    if (!sel) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/email/templates", {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({
          evento:    sel.evento,
          assunto:   sel.assunto,
          html:      sel.html,
          texto:     sel.texto,
          ativo:     sel.ativo,
          descricao: sel.descricao,
          variaveis: sel.variaveis,
        }),
      });
      const d = await r.json();
      if (d.success) {
        await alertar({ titulo: "Template salvo", tipo: "sucesso" });
        carregar();
      } else {
        await alertar({ titulo: "Falha ao salvar", mensagem: d.error?.message ?? "", tipo: "perigo" });
      }
    } finally { setSaving(false); }
  }

  async function testar() {
    if (!sel || !destinoTeste.trim()) {
      await alertar({ titulo: "Destino obrigatório", mensagem: "Informe um e-mail.", tipo: "alerta" });
      return;
    }
    const r = await fetch("/api/admin/email/testar", {
      method: "POST", headers: authHeader(),
      body: JSON.stringify({ destino: destinoTeste.trim(), evento: sel.evento }),
    });
    const d = await r.json();
    await alertar({
      titulo:   d.data?.sucesso ? "✓ Enviado" : "Falha",
      mensagem: d.data?.mensagem ?? d.error?.message ?? "?",
      tipo:     d.data?.sucesso ? "sucesso" : "perigo",
    });
  }

  if (loading) return (
    <div className="flex h-60 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
    </div>
  );

  return (
    <div className="space-y-4 pb-12 max-w-7xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <FileText className="h-5 w-5 text-emerald-400" /> Templates de e-mail
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Customize HTML, assunto e fallback texto para cada evento.
          </p>
        </div>
        <Link href="/admin/email"
          className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Lista lateral */}
        <aside className="space-y-1">
          {list.map(t => (
            <button key={t.id}
              onClick={() => setSel(t)}
              className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                sel?.id === t.id
                  ? "border-emerald-500/40 bg-emerald-500/10 text-white"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}>
              <span className={`mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                t.ativo ? "bg-emerald-400" : "bg-slate-600"
              }`} />
              <div className="min-w-0">
                <p className="font-medium truncate">{EVENTO_LABELS[t.evento] ?? t.evento}</p>
                <p className="text-[10px] text-slate-500 font-mono truncate">{t.evento}</p>
              </div>
            </button>
          ))}
        </aside>

        {/* Editor */}
        {sel ? (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="font-bold text-white truncate">
                  {EVENTO_LABELS[sel.evento] ?? sel.evento}
                </h2>
                {sel.descricao && (
                  <p className="text-xs text-slate-500 mt-0.5">{sel.descricao}</p>
                )}
              </div>
              <button onClick={() => setSel({ ...sel, ativo: !sel.ativo })}
                className={`flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold ${
                  sel.ativo
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-700 bg-slate-800 text-slate-400"
                }`}>
                {sel.ativo ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                {sel.ativo ? "Ativo" : "Desativado"}
              </button>
            </div>

            {/* Variáveis disponíveis */}
            {sel.variaveis.length > 0 && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                <p className="text-xs font-bold text-blue-300 mb-1.5 flex items-center gap-1">
                  <Code className="h-3.5 w-3.5" /> Variáveis disponíveis
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {sel.variaveis.map(v => (
                    <code key={v} className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-mono text-blue-200">
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-blue-200/70">
                  Use <code>{`{{#var}}…{{/var}}`}</code> pra bloco condicional (renderiza só se var truthy).
                </p>
              </div>
            )}

            <label className="block">
              <span className="text-xs font-medium text-slate-400 mb-1 block">Assunto *</span>
              <input value={sel.assunto}
                onChange={e => setSel({ ...sel, assunto: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-400 mb-1 block">HTML *</span>
              <textarea value={sel.html}
                onChange={e => setSel({ ...sel, html: e.target.value })}
                rows={20}
                spellCheck={false}
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-mono text-emerald-300 leading-relaxed" />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-400 mb-1 block">
                Texto plano (fallback pra clientes sem HTML)
              </span>
              <textarea value={sel.texto ?? ""}
                onChange={e => setSel({ ...sel, texto: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            </label>

            {/* Ações */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
              <button onClick={salvar} disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button onClick={() => setPreviewOpen(true)}
                className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <input type="email" value={destinoTeste}
                  onChange={e => setDestinoTeste(e.target.value)}
                  placeholder="seu@email.com"
                  className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white" />
                <button onClick={testar} disabled={!destinoTeste.trim()}
                  className="flex items-center gap-1 rounded-xl bg-blue-500 hover:bg-blue-400 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-30">
                  <Send className="h-3.5 w-3.5" /> Enviar teste
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-60 items-center justify-center rounded-2xl border border-dashed border-white/10 text-slate-500 text-sm">
            Selecione um template
          </div>
        )}
      </div>

      {/* Preview */}
      {previewOpen && sel && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
             onClick={() => setPreviewOpen(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-2xl border border-white/10 bg-white shadow-2xl"
               onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b bg-slate-900 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-white">Preview · {sel.evento}</p>
                <p className="text-xs text-slate-400">Assunto: {sel.assunto}</p>
              </div>
              <button onClick={() => setPreviewOpen(false)}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5">
                Fechar
              </button>
            </div>
            <iframe srcDoc={sel.html} className="w-full" style={{ height: "70vh", border: 0 }} />
          </div>
        </div>
      )}
    </div>
  );
}
