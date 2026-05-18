"use client";

/**
 * /admin/contratos
 * Master gerencia templates de contrato. Cria/edita/ativa/desativa.
 * Variáveis disponíveis na composição: {{contratante_*}}, {{contratada_*}}, {{data_contrato}}.
 */
import { useEffect, useState, useCallback } from "react";
import { FileSignature, Plus, Edit3, Trash2, Eye, X, Loader2, Save, Power } from "lucide-react";
import { alertar, confirmar } from "@/components/ui/ConfirmModal";

interface Template {
  id: string; versao: string; titulo: string; descricao: string | null;
  conteudo_html: string; tipo: string; ativo: boolean; created_at: string;
}

const VARS_DISPONIVEIS = [
  { v: "contratante_razao_social",  desc: "Razão social do cliente" },
  { v: "contratante_nome_fantasia", desc: "Nome fantasia do cliente" },
  { v: "contratante_cnpj",          desc: "CNPJ do cliente" },
  { v: "contratante_endereco",      desc: "Endereço completo do cliente" },
  { v: "contratante_cidade",        desc: "Cidade do cliente" },
  { v: "contratante_uf",            desc: "UF do cliente" },
  { v: "contratante_representante", desc: "Nome do gestor/representante" },
  { v: "contratante_cpf",           desc: "CPF do representante" },
  { v: "contratante_email",         desc: "Email do cliente" },
  { v: "contratante_telefone",      desc: "Telefone/WhatsApp" },
  { v: "contratada_razao_social",   desc: "Razão social da SUA empresa (SaaS)" },
  { v: "contratada_cnpj",           desc: "Seu CNPJ" },
  { v: "contratada_endereco",       desc: "Seu endereço" },
  { v: "contratada_cidade",         desc: "Sua cidade (usado no foro)" },
  { v: "contratada_email",          desc: "Seu email" },
  { v: "contratada_telefone",       desc: "Seu telefone" },
  { v: "data_contrato",             desc: "Data atual formatada (ex: 17 de maio de 2026)" },
];

export default function ContratosPage() {
  const [list, setList] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [novo, setNovo] = useState(false);
  const [preview, setPreview] = useState<Template | null>(null);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/contratos/templates", { headers: auth() }).then(r => r.json());
    if (r.success) setList(r.data ?? []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(t: Template, isNovo: boolean) {
    const url    = isNovo ? "/api/admin/contratos/templates" : `/api/admin/contratos/templates/${t.id}`;
    const method = isNovo ? "POST" : "PATCH";
    const r = await fetch(url, {
      method, headers: auth(),
      body: JSON.stringify({
        versao: t.versao, titulo: t.titulo, descricao: t.descricao,
        conteudo_html: t.conteudo_html, tipo: t.tipo, ativo: t.ativo,
      }),
    });
    const d = await r.json();
    if (!d.success) { await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" }); return; }
    setEditing(null); setNovo(false);
    carregar();
  }

  async function toggleAtivo(t: Template) {
    await fetch(`/api/admin/contratos/templates/${t.id}`, {
      method: "PATCH", headers: auth(),
      body: JSON.stringify({ ativo: !t.ativo }),
    });
    carregar();
  }

  async function remover(t: Template) {
    if (!await confirmar({ titulo: `Remover "${t.titulo}"?`, perigo: true })) return;
    await fetch(`/api/admin/contratos/templates/${t.id}`, { method: "DELETE", headers: auth() });
    carregar();
  }

  function abrirNovo() {
    setEditing({
      id: "", versao: `v-${Date.now()}`, titulo: "Novo contrato", descricao: "",
      conteudo_html: "<h1>Título</h1>\n<p>Use {{contratante_razao_social}} etc.</p>",
      tipo: "onboarding", ativo: true, created_at: "",
    });
    setNovo(true);
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSignature className="h-6 w-6 text-emerald-400" />
          <h1 className="text-xl font-bold text-white">Templates de contrato</h1>
        </div>
        <button onClick={abrirNovo}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400">
          <Plus className="h-4 w-4" /> Novo template
        </button>
      </div>

      <div className="grid gap-3">
        {list.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
            Nenhum template cadastrado.
          </div>
        ) : list.map(t => (
          <div key={t.id} className={`flex items-center gap-3 rounded-xl border p-4 ${
            t.ativo ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/5 opacity-60"
          }`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{t.titulo}</p>
              <p className="text-xs text-slate-400">
                v{t.versao} · {t.tipo} {t.ativo ? "· ATIVO" : "· inativo"}
              </p>
              {t.descricao && <p className="text-[11px] text-slate-500 italic">{t.descricao}</p>}
            </div>
            <button onClick={() => setPreview(t)}
              className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/10" title="Pré-visualizar">
              <Eye className="h-4 w-4" />
            </button>
            <button onClick={() => { setEditing(t); setNovo(false); }}
              className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/10" title="Editar">
              <Edit3 className="h-4 w-4" />
            </button>
            <button onClick={() => toggleAtivo(t)}
              className={`rounded-lg border p-2 ${
                t.ativo ? "border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                        : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
              }`} title={t.ativo ? "Desativar" : "Ativar"}>
              <Power className="h-4 w-4" />
            </button>
            <button onClick={() => remover(t)}
              className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10" title="Remover">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Modal editor */}
      {editing && (
        <EditorModal
          template={editing}
          onChange={t => setEditing(t)}
          onSave={() => salvar(editing!, novo)}
          onClose={() => { setEditing(null); setNovo(false); }}
        />
      )}

      {/* Modal preview */}
      {preview && (
        <PreviewModal template={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function EditorModal({ template, onChange, onSave, onClose }: {
  template: Template; onChange: (t: Template) => void; onSave: () => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function handleSave() {
    setBusy(true);
    try { onSave(); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h3 className="text-base font-bold text-white">Editar template</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_280px] overflow-hidden">
          <div className="overflow-y-auto p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Versão">
                <input value={template.versao} onChange={e => onChange({ ...template, versao: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
              </Field>
              <Field label="Tipo">
                <select value={template.tipo} onChange={e => onChange({ ...template, tipo: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white">
                  <option value="onboarding">Onboarding (cadastro inicial)</option>
                  <option value="aditivo">Aditivo contratual</option>
                  <option value="servico_extra">Serviço extra/avulso</option>
                </select>
              </Field>
            </div>
            <Field label="Título">
              <input value={template.titulo} onChange={e => onChange({ ...template, titulo: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
            </Field>
            <Field label="Descrição interna (não aparece pro cliente)">
              <input value={template.descricao ?? ""} onChange={e => onChange({ ...template, descricao: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
            </Field>
            <Field label="Conteúdo HTML">
              <textarea value={template.conteudo_html}
                onChange={e => onChange({ ...template, conteudo_html: e.target.value })}
                rows={20}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white font-mono" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={template.ativo}
                onChange={e => onChange({ ...template, ativo: e.target.checked })} />
              Template ativo (clientes novos verão essa versão)
            </label>
          </div>
          {/* Sidebar variáveis */}
          <div className="border-l border-white/10 bg-white/5 overflow-y-auto p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Variáveis</p>
            <p className="mb-3 text-[10px] text-slate-500">Clique pra copiar e cole no editor</p>
            <div className="space-y-1">
              {VARS_DISPONIVEIS.map(v => (
                <button key={v.v} type="button"
                  onClick={() => navigator.clipboard.writeText(`{{${v.v}}}`)}
                  className="w-full text-left rounded-lg border border-white/5 bg-black/20 px-2 py-1.5 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition">
                  <code className="text-[11px] text-emerald-300">{`{{${v.v}}}`}</code>
                  <p className="text-[10px] text-slate-500 mt-0.5">{v.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-white/10 px-5 py-3">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ template, onClose }: { template: Template; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h3 className="text-base font-bold text-white">Preview — {template.titulo}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto bg-white">
          <article
            className="mx-auto max-w-2xl p-10 contrato-preview"
            style={{
              color: "#1a202c",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
              lineHeight: 1.7,
            }}
          >
            <style jsx>{`
              .contrato-preview :global(h1) { color:#0f172a;font-size:24px;font-weight:bold;margin:0 0 16px;border-bottom:2px solid #10b981;padding-bottom:8px; }
              .contrato-preview :global(h2) { color:#10b981;font-size:18px;font-weight:bold;margin:24px 0 12px; }
              .contrato-preview :global(h3) { color:#334155;font-size:15px;font-weight:bold;margin:18px 0 10px; }
              .contrato-preview :global(p)  { color:#334155;margin:8px 0;font-size:14px; }
              .contrato-preview :global(ul) { color:#334155;margin:8px 0;padding-left:24px;font-size:14px; }
              .contrato-preview :global(li) { margin:4px 0; }
              .contrato-preview :global(hr) { border:0;border-top:1px solid #e2e8f0;margin:20px 0; }
              .contrato-preview :global(strong) { color:#0f172a; }
              .contrato-preview :global(blockquote) { color:#475569;border-left:3px solid #10b981;padding-left:12px;margin:12px 0; }
            `}</style>
            <div dangerouslySetInnerHTML={{ __html: template.conteudo_html }} />
          </article>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  );
}
