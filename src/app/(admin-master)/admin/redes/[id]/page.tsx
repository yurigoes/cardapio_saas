"use client";

/**
 * /admin/redes/[id] — gerencia rede + filiais
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Network, Building2, Plus, X, Save, Trash2, Loader2, Star,
} from "lucide-react";
import { alertar, confirmar } from "@/components/ui/ConfirmModal";

interface Rede {
  id: string; nome: string; cnpj_matriz: string | null;
  razao_social: string | null; logo_url: string | null; cor_primaria: string | null;
  fidelidade_cross_filial: boolean; cardapio_sincronizado: boolean;
  desconto_progressivo_pct: number; plano_id: string | null;
  email_contato: string | null; whatsapp: string | null;
}

interface Filial {
  id: string; nome_fantasia: string; nome_filial: string | null;
  is_matriz: boolean; ordem_filial: number; status: string;
  cnpj: string | null; endereco_cidade: string | null; endereco_uf: string | null;
}

interface EmpresaOpt { id: string; nome_fantasia: string; rede_id: string | null }

export default function RedeDetalhePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [rede, setRede] = useState<Rede | null>(null);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpt[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vincNova, setVincNova] = useState(false);
  const [empSelecionada, setEmpSelecionada] = useState("");
  const [filNome, setFilNome] = useState("");
  const [marcMatriz, setMarcMatriz] = useState(false);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    const [r, e] = await Promise.all([
      fetch(`/api/admin/redes/${id}`, { headers: auth() }).then(r => r.json()),
      fetch(`/api/admin/empresas?per_page=300`, { headers: auth() }).then(r => r.json()).catch(() => null),
    ]);
    if (r.success) {
      setRede(r.data.rede);
      setFiliais(r.data.filiais ?? []);
    }
    if (e?.success) {
      const lista = e.data?.empresas ?? e.data ?? [];
      setEmpresas(lista);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  function set<K extends keyof Rede>(k: K, v: Rede[K]) {
    setRede(prev => prev ? { ...prev, [k]: v } : prev);
    setDirty(true);
  }

  async function salvar() {
    if (!rede) return;
    setSaving(true);
    try {
      const { id: _id, ...payload } = rede;
      void _id;
      const r = await fetch(`/api/admin/redes/${id}`, {
        method: "PATCH", headers: auth(),
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.success) throw new Error(typeof d.error === "string" ? d.error : "?");
      setDirty(false);
      await alertar({ titulo: "Salvo", tipo: "sucesso" });
    } catch (e) {
      await alertar({ titulo: "Falha", mensagem: (e as Error).message, tipo: "perigo" });
    } finally { setSaving(false); }
  }

  async function vincular() {
    if (!empSelecionada) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/redes/${id}/vincular`, {
        method: "POST", headers: auth(),
        body: JSON.stringify({
          empresa_id: empSelecionada,
          nome_filial: filNome || undefined,
          is_matriz: marcMatriz,
        }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(typeof d.error === "string" ? d.error : "?");
      setVincNova(false); setEmpSelecionada(""); setFilNome(""); setMarcMatriz(false);
      carregar();
    } catch (e) {
      await alertar({ titulo: "Falha", mensagem: (e as Error).message, tipo: "perigo" });
    } finally { setSaving(false); }
  }

  async function desvincular(filialId: string, nome: string) {
    if (!await confirmar({ titulo: `Desvincular ${nome}?`, mensagem: "Empresa volta a operar standalone.", perigo: true })) return;
    await fetch(`/api/admin/redes/${id}/vincular?empresa_id=${filialId}`, {
      method: "DELETE", headers: auth(),
    });
    carregar();
  }

  if (!rede) return <div className="p-8 text-slate-400">Carregando...</div>;

  const empresasDisponiveis = empresas.filter(e => !e.rede_id || e.rede_id === id);
  const empresasNaoVinculadas = empresas.filter(e => !e.rede_id && !filiais.some(f => f.id === e.id));

  return (
    <div className="space-y-6 max-w-5xl pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin/redes")}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Network className="h-6 w-6 text-emerald-400" />
          <h1 className="text-xl font-bold text-white">{rede.nome}</h1>
        </div>
        <button onClick={salvar} disabled={!dirty || saving}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </button>
      </div>

      {/* Config rede */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Configurações da rede</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome">
            <input value={rede.nome} onChange={e => set("nome", e.target.value)} className={INP} />
          </Field>
          <Field label="CNPJ matriz">
            <input value={rede.cnpj_matriz ?? ""} onChange={e => set("cnpj_matriz", e.target.value)} className={INP} />
          </Field>
          <Field label="Razão social">
            <input value={rede.razao_social ?? ""} onChange={e => set("razao_social", e.target.value)} className={INP} />
          </Field>
          <Field label="Cor primária">
            <input value={rede.cor_primaria ?? "#10b981"} onChange={e => set("cor_primaria", e.target.value)} className={INP} />
          </Field>
          <Field label="Email contato">
            <input type="email" value={rede.email_contato ?? ""} onChange={e => set("email_contato", e.target.value)} className={INP} />
          </Field>
          <Field label="WhatsApp">
            <input value={rede.whatsapp ?? ""} onChange={e => set("whatsapp", e.target.value)} className={INP} />
          </Field>
          <Field label="Desconto progressivo % (2ª filial em diante)">
            <input type="number" min={0} max={100} step={5} value={rede.desconto_progressivo_pct}
              onChange={e => set("desconto_progressivo_pct", Number(e.target.value))} className={INP} />
          </Field>
        </div>
        <div className="space-y-2 pt-2">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={rede.cardapio_sincronizado}
              onChange={e => set("cardapio_sincronizado", e.target.checked)} />
            <strong>Cardápio sincronizado</strong> — produtos e categorias compartilhados entre todas filiais
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={rede.fidelidade_cross_filial}
              onChange={e => set("fidelidade_cross_filial", e.target.checked)} />
            <strong>Fidelidade compartilhada</strong> — cliente acumula pontos em qualquer filial
          </label>
        </div>
      </section>

      {/* Filiais */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Filiais ({filiais.length})
          </h2>
          <button onClick={() => setVincNova(v => !v)}
            className="flex items-center gap-1 rounded-xl bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/25">
            <Plus className="h-3.5 w-3.5" /> Vincular empresa
          </button>
        </div>

        {vincNova && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <select value={empSelecionada} onChange={e => setEmpSelecionada(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white">
              <option value="">— escolher empresa standalone —</option>
              {empresasNaoVinculadas.map(e => <option key={e.id} value={e.id}>{e.nome_fantasia}</option>)}
            </select>
            <input value={filNome} onChange={e => setFilNome(e.target.value)}
              placeholder="Nome curto da filial (ex: Pituba)"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={marcMatriz} onChange={e => setMarcMatriz(e.target.checked)} />
              Marcar como matriz (desmarca outras)
            </label>
            <div className="flex gap-2">
              <button onClick={() => { setVincNova(false); setEmpSelecionada(""); }}
                className="flex-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs">Cancelar</button>
              <button onClick={vincular} disabled={!empSelecionada || saving}
                className="flex-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                Vincular
              </button>
            </div>
          </div>
        )}

        {filiais.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">Nenhuma filial vinculada ainda</p>
        ) : (
          <div className="space-y-2">
            {filiais.map(f => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <Building2 className="h-5 w-5 text-emerald-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white flex items-center gap-2">
                    {f.nome_filial ?? f.nome_fantasia}
                    {f.is_matriz && <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"><Star className="h-2.5 w-2.5" />MATRIZ</span>}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {f.nome_fantasia}
                    {f.cnpj && ` · CNPJ ${f.cnpj}`}
                    {f.endereco_cidade && ` · ${f.endereco_cidade}${f.endereco_uf ? "/" + f.endereco_uf : ""}`}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase">{f.status}</p>
                </div>
                <a href={`/admin/empresas/${f.id}/editar`}
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5">
                  Editar
                </a>
                <button onClick={() => desvincular(f.id, f.nome_filial ?? f.nome_fantasia)}
                  className="rounded-lg border border-red-500/30 p-1.5 text-red-300 hover:bg-red-500/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const INP = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  );
}
