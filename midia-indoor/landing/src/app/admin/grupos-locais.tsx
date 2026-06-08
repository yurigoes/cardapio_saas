"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, X, Trash2 } from "lucide-react";
import { notify, confirmModal } from "@/components/Notify";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}

interface LocalSimples { id: string; nome: string; cidade: string | null; tipo?: string; }

function Field({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm text-slate-300">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
    </div>
  );
}

function Modal({ onClose, title, wide, children }: { onClose: () => void; title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-sm"} rounded-2xl border border-white/10 bg-[#12121c] p-6`} onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="font-bold">{title}</h3><button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div>
        {children}
      </div>
    </div>
  );
}

interface GrupoLocal { id: string; nome: string; cidade: string | null; sincronia: boolean; xibo_display_group_id: number | null; membros: Array<{ id: string; nome: string; cidade: string | null; ordem: number }>; }

export function GruposDeLocais({ token, locaisDisponiveis }: { token: string; locaisDisponiveis: LocalSimples[] }) {
  const [grupos, setGrupos] = useState<GrupoLocal[]>([]);
  const [editar, setEditar] = useState<GrupoLocal | null>(null);
  const load = useCallback(async () => {
    const r = await aapi(token, "/api/admin/locais/grupos"); const d = await r.json();
    if (d.ok) setGrupos(d.grupos);
  }, [token]);
  useEffect(() => { load(); }, [load]);
  async function excluir(g: GrupoLocal) {
    if (!await confirmModal(`Excluir o grupo "${g.nome}"? Os locais membros NÃO serão excluídos.`)) return;
    await aapi(token, `/api/admin/locais/grupos?id=${g.id}`, { method: "DELETE" });
    notify("Grupo excluído", "success"); load();
  }
  if (!grupos.length) return null;
  return (
    <div className="mt-8">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-amber-300">📦 Grupos de locais ({grupos.length})</h3>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {grupos.map(g => (
          <div key={g.id} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-amber-100">{g.nome}</p>
                <p className="text-xs text-slate-400">{g.cidade ?? ""}{g.sincronia ? " · 🔗 sync" : ""}</p>
              </div>
              <span className="rounded bg-amber-500/30 px-2 py-0.5 text-xs font-semibold text-amber-200">{g.membros.length} telas</span>
            </div>
            <div className="mt-3 max-h-32 overflow-y-auto space-y-1 text-xs">
              {g.membros.map((m, i) => (
                <div key={m.id} className="flex items-center gap-1 rounded bg-white/5 px-2 py-1">
                  <span className="text-slate-500">{i + 1}.</span>
                  <span className="text-slate-200">{m.nome}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setEditar(g)} className="flex-1 rounded-lg border border-white/15 py-1.5 text-xs hover:bg-white/5">Editar</button>
              <button onClick={() => excluir(g)} className="rounded-lg border border-red-500/30 px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      {editar && <EditGrupoLocaisModal token={token} grupo={editar} locais={locaisDisponiveis} onClose={() => setEditar(null)} onSaved={() => { setEditar(null); load(); }} />}
    </div>
  );
}

export function NovoGrupoLocaisModal({ token, locais, onClose, onSaved }: { token: string; locais: LocalSimples[]; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(""); const [cidade, setCidade] = useState("");
  const [sincronia, setSincronia] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  function toggle(id: string) { setSelecionados(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }
  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/locais/grupos", { method: "POST", body: JSON.stringify({ nome, cidade: cidade || undefined, sincronia, membros: selecionados }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    notify("Grupo criado", "success");
    onSaved();
  }
  const elegiveis = locais.filter(l => l.tipo !== "grupo");
  return (
    <Modal onClose={onClose} title="Novo grupo de locais (multi-TV)" wide>
      <p className="mb-3 text-xs text-slate-400">Use pra agrupar múltiplas TVs do mesmo cliente. Ex: 8 pontas de gôndola num atacadão. Ao apontar uma campanha pro grupo, ela toca em todas as telas membros.</p>
      <Field label="Nome do grupo" value={nome} onChange={setNome} placeholder="ex: Atacadão XYZ - Pontas de gôndola" />
      <Field label="Cidade (opcional)" value={cidade} onChange={setCidade} />
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={sincronia} onChange={e => setSincronia(e.target.checked)} className="h-4 w-4 accent-brand" />
        Sincronia entre telas (mesmo conteúdo no mesmo instante, modo dominó)
      </label>
      <label className="mb-1 block text-sm text-slate-300">Telas membros ({selecionados.length} selecionadas)</label>
      <div className="mb-3 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-2">
        {elegiveis.map(l => (
          <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/5">
            <input type="checkbox" checked={selecionados.includes(l.id)} onChange={() => toggle(l.id)} className="h-4 w-4 accent-brand" />
            <span>{l.nome}{l.cidade ? <span className="text-slate-500"> · {l.cidade}</span> : null}</span>
          </label>
        ))}
        {!elegiveis.length && <p className="p-2 text-xs text-slate-500">Cadastre locais individuais antes.</p>}
      </div>
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy || !nome || selecionados.length < 1} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar grupo
      </button>
      <p className="mt-2 text-xs text-slate-500">Ao salvar: o sistema cria automaticamente o Display Group correspondente no Xibo agregando todas as TVs membros. Campanhas apontadas pra esse grupo vão tocar em todas elas.</p>
    </Modal>
  );
}

function EditGrupoLocaisModal({ token, grupo, locais, onClose, onSaved }: { token: string; grupo: GrupoLocal; locais: LocalSimples[]; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(grupo.nome);
  const [sincronia, setSincronia] = useState(grupo.sincronia);
  const [selecionados, setSelecionados] = useState<string[]>(grupo.membros.map(m => m.id));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  function toggle(id: string) { setSelecionados(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }
  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/locais/grupos", { method: "PATCH", body: JSON.stringify({ id: grupo.id, nome, sincronia, membros: selecionados }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    notify("Grupo atualizado", "success");
    onSaved();
  }
  const elegiveis = locais.filter(l => l.tipo !== "grupo");
  return (
    <Modal onClose={onClose} title={`Editar grupo: ${grupo.nome}`} wide>
      <Field label="Nome" value={nome} onChange={setNome} />
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={sincronia} onChange={e => setSincronia(e.target.checked)} className="h-4 w-4 accent-brand" />
        Sincronia entre telas
      </label>
      <label className="mb-1 block text-sm text-slate-300">Telas membros ({selecionados.length})</label>
      <div className="mb-3 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-2">
        {elegiveis.map(l => (
          <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/5">
            <input type="checkbox" checked={selecionados.includes(l.id)} onChange={() => toggle(l.id)} className="h-4 w-4 accent-brand" />
            <span>{l.nome}{l.cidade ? <span className="text-slate-500"> · {l.cidade}</span> : null}</span>
          </label>
        ))}
      </div>
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar</button>
    </Modal>
  );
}
