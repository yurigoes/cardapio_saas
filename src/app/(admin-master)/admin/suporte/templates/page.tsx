"use client";

/**
 * /admin/suporte/templates — Biblioteca de templates de email/WhatsApp
 * pra disparo manual nos chamados.
 */
import { useEffect, useState } from "react";
import { Mail, MessageCircle, Plus, Trash2, Edit, X, Save, Loader2 } from "lucide-react";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";

interface Template {
  id: string; tipo: "email" | "whatsapp"; nome: string;
  assunto: string | null; conteudo: string; variaveis: string[];
  created_at: string;
}

function authH(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<"email" | "whatsapp">("email");

  // Modal editor
  const [editor, setEditor] = useState<Partial<Template> | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const r = await fetch("/api/admin/suporte/templates", { headers: authH(), cache: "no-store" });
      const d = await r.json();
      if (d.success) setTemplates(d.data.templates ?? []);
    } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function salvar() {
    if (!editor) return;
    if (!editor.nome || editor.nome.length < 2 || !editor.conteudo || editor.conteudo.length < 3) {
      await alertar({ titulo: "Campos obrigatórios", mensagem: "Nome e conteúdo são obrigatórios", tipo: "alerta" });
      return;
    }
    setSalvando(true);
    try {
      const isUpdate = !!editor.id;
      const url = isUpdate ? `/api/admin/suporte/templates/${editor.id}` : "/api/admin/suporte/templates";
      const r = await fetch(url, {
        method: isUpdate ? "PATCH" : "POST",
        headers: { ...authH(), "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo:     editor.tipo ?? tab,
          nome:     editor.nome,
          assunto:  editor.assunto ?? null,
          conteudo: editor.conteudo,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      setEditor(null);
      carregar();
    } catch (e) {
      await alertar({ titulo: "Erro", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    } finally { setSalvando(false); }
  }

  async function deletar(t: Template) {
    const ok = await confirmar({
      titulo: "Apagar template",
      mensagem: `Apagar "${t.nome}"? Não pode desfazer.`,
      perigo: true,
    });
    if (!ok) return;
    await fetch(`/api/admin/suporte/templates/${t.id}`, { method: "DELETE", headers: authH() });
    carregar();
  }

  const filtrados = templates.filter(t => t.tipo === tab);

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Mail className="h-5 w-5 text-emerald-400" /> Templates de mensagens
          </h1>
          <p className="text-sm text-slate-400">Biblioteca pra disparo manual nos chamados (botões Email/WhatsApp)</p>
        </div>
        <button onClick={() => setEditor({ tipo: tab, nome: "", conteudo: "" })}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600">
          <Plus className="h-4 w-4" /> Novo template
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {[
          { v: "email" as const,    lbl: "Email",    icon: Mail },
          { v: "whatsapp" as const, lbl: "WhatsApp", icon: MessageCircle },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.v} onClick={() => setTab(t.v)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 ${
                tab === t.v ? "border-emerald-400 text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-300"
              }`}>
              <Icon className="h-4 w-4" /> {t.lbl}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400 mx-auto" />
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-slate-900 p-12 text-center text-sm text-slate-500">
          Nenhum template de {tab} ainda. Clique em &quot;Novo template&quot; pra criar.
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(t => (
            <div key={t.id} className="rounded-xl border border-white/10 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">{t.nome}</p>
                  {t.assunto && <p className="text-xs text-slate-400 mt-0.5">Assunto: {t.assunto}</p>}
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2 whitespace-pre-wrap">{t.conteudo}</p>
                  {t.variaveis.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.variaveis.map(v => (
                        <code key={v} className="text-[10px] bg-slate-800 text-emerald-300 rounded px-1.5 py-0.5">{`{${v}}`}</code>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => setEditor(t)}
                    className="rounded border border-blue-500/30 bg-blue-500/10 p-1.5 text-blue-300 hover:bg-blue-500/20">
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deletar(t)}
                    className="rounded border border-red-500/30 bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal editor */}
      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setEditor(null); }}>
          <div className="w-full max-w-2xl rounded-2xl border border-emerald-500/30 bg-slate-900 p-6 max-h-[90vh] overflow-auto">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-base font-bold text-white">
                {editor.id ? "Editar" : "Novo"} template ({editor.tipo ?? tab})
              </h3>
              <button onClick={() => setEditor(null)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-1 block text-xs font-medium text-slate-400">Nome (referência interna)</label>
            <input value={editor.nome ?? ""} onChange={e => setEditor({ ...editor, nome: e.target.value })}
              placeholder="Ex: Reenvio de credenciais"
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />

            {(editor.tipo ?? tab) === "email" && (
              <>
                <label className="mb-1 block text-xs font-medium text-slate-400">Assunto</label>
                <input value={editor.assunto ?? ""} onChange={e => setEditor({ ...editor, assunto: e.target.value })}
                  placeholder="Use {variaveis} se quiser"
                  className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              </>
            )}

            <label className="mb-1 block text-xs font-medium text-slate-400">
              Conteúdo {(editor.tipo ?? tab) === "email" ? "(HTML aceito)" : "(use *negrito* + \\n)"}
            </label>
            <textarea value={editor.conteudo ?? ""} onChange={e => setEditor({ ...editor, conteudo: e.target.value })}
              rows={10}
              placeholder={(editor.tipo ?? tab) === "email"
                ? "<p>Olá {cliente}!</p><p>...</p>"
                : "Olá *{cliente}*!\\n\\nMensagem..."}
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm font-mono text-white resize-none" />

            <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-2 text-[11px] text-blue-200">
              💡 Use <code>{"{variavel}"}</code> pra placeholders. Sugestões: {"{cliente} {operador} {assunto} {link} {empresa} {numero} {senha} {email}"}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditor(null)} disabled={salvando}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
