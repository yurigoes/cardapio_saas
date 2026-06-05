"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, X, Archive, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { notify, confirmModal } from "@/components/Notify";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}

interface Anunc { id: string; empresa: string; nome: string; email: string; }

function Field({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm text-slate-300">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
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

// ─── Notas Fiscais ───────────────────────────────────────────────────────────
interface NF { id: string; numero: string | null; serie: string | null; valor: string; data_emissao: string; status: string; pdf_url: string | null; empresa: string; campanha_nome: string | null; observacao: string | null; }
export function Notas({ token }: { token: string }) {
  const [lista, setLista] = useState<NF[]>([]);
  const [novo, setNovo] = useState(false);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/notas"); const d = await r.json(); if (d.ok) setLista(d.notas); }, [token]);
  useEffect(() => { load(); }, [load]);
  async function setStatus(id: string, status: string) { await aapi(token, "/api/admin/notas", { method: "PATCH", body: JSON.stringify({ id, status }) }); load(); }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Notas fiscais</h2>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Registrar NF</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Data</th><th className="p-3">Empresa</th><th className="p-3">Campanha</th><th className="p-3">Nº/Série</th><th className="p-3">Valor</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {lista.map(n => (
              <tr key={n.id} className="border-t border-white/5">
                <td className="p-3 text-xs">{n.data_emissao}</td>
                <td className="p-3">{n.empresa}</td>
                <td className="p-3 text-xs">{n.campanha_nome ?? "—"}</td>
                <td className="p-3 text-xs">{n.numero ?? "—"}{n.serie ? `/${n.serie}` : ""}</td>
                <td className="p-3">{brl(Number(n.valor))}</td>
                <td className="p-3"><span className={`rounded px-2 py-0.5 text-xs ${n.status === "emitida" ? "bg-emerald-500/20 text-emerald-300" : n.status === "cancelada" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>{n.status}</span></td>
                <td className="p-3 text-right text-xs">
                  {n.pdf_url && <a href={n.pdf_url} target="_blank" rel="noopener" className="mr-2 underline">PDF</a>}
                  {n.status === "pendente" && <button onClick={() => setStatus(n.id, "emitida")} className="rounded border border-emerald-500/30 px-2 py-1 text-emerald-300 hover:bg-emerald-500/10">Emitir</button>}
                  {n.status === "emitida"  && <button onClick={() => setStatus(n.id, "cancelada")} className="rounded border border-red-500/30 px-2 py-1 text-red-300 hover:bg-red-500/10">Cancelar</button>}
                </td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Nenhuma NF.</td></tr>}
          </tbody>
        </table>
      </div>
      {novo && <NovaNotaModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
    </div>
  );
}
function NovaNotaModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [contas, setContas] = useState<Anunc[]>([]);
  const [contaId, setContaId] = useState(""); const [numero, setNumero] = useState(""); const [serie, setSerie] = useState("");
  const [valor, setValor] = useState(""); const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [pdf, setPdf] = useState(""); const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { aapi(token, "/api/admin/anunciantes").then(r => r.json()).then(d => d.ok && setContas(d.anunciantes)); }, [token]);
  async function salvar() {
    setBusy(true); setErr("");
    const body = { conta_id: contaId, numero: numero || undefined, serie: serie || undefined, valor: Number(valor), data_emissao: data, pdf_url: pdf || undefined, observacao: obs || undefined };
    const r = await aapi(token, "/api/admin/notas", { method: "POST", body: JSON.stringify(body) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal onClose={onClose} title="Registrar NF">
      <label className="mb-1 block text-sm text-slate-300">Anunciante</label>
      <select value={contaId} onChange={e => setContaId(e.target.value)} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
        <option value="">Selecione…</option>
        {contas.map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Número" value={numero} onChange={setNumero} placeholder="00000123" />
        <Field label="Série" value={serie} onChange={setSerie} placeholder="1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" value={valor} onChange={setValor} type="number" />
        <Field label="Data emissão" value={data} onChange={setData} type="date" />
      </div>
      <Field label="URL do PDF (opcional)" value={pdf} onChange={setPdf} placeholder="https://..." />
      <Field label="Observação" value={obs} onChange={setObs} />
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy || !contaId || !valor} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Registrar</button>
    </Modal>
  );
}

// ─── Cobranças recorrentes ───────────────────────────────────────────────────
interface Cob { id: string; nome: string; valor_mensal: string; dia_vencimento: number; ativo: boolean; proximo_venc: string | null; ultimo_cobrado: string | null; empresa: string; ultima_competencia: string | null; }
export function Cobrancas({ token }: { token: string }) {
  const [lista, setLista] = useState<Cob[]>([]);
  const [novo, setNovo] = useState(false);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/cobrancas"); const d = await r.json(); if (d.ok) setLista(d.cobrancas); }, [token]);
  useEffect(() => { load(); }, [load]);
  async function toggle(c: Cob) { await aapi(token, "/api/admin/cobrancas", { method: "PATCH", body: JSON.stringify({ id: c.id, ativo: !c.ativo }) }); load(); }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cobranças recorrentes</h2>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Nova cobrança</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Empresa</th><th className="p-3">Descrição</th><th className="p-3">Mensal</th><th className="p-3">Dia</th><th className="p-3">Próx. venc.</th><th className="p-3">Última</th><th className="p-3">Ativo</th></tr></thead>
          <tbody>
            {lista.map(c => (
              <tr key={c.id} className="border-t border-white/5">
                <td className="p-3">{c.empresa}</td>
                <td className="p-3">{c.nome}</td>
                <td className="p-3">{brl(Number(c.valor_mensal))}</td>
                <td className="p-3 text-xs">{c.dia_vencimento}</td>
                <td className="p-3 text-xs">{c.proximo_venc ?? "—"}</td>
                <td className="p-3 text-xs">{c.ultima_competencia ?? "—"}</td>
                <td className="p-3"><button onClick={() => toggle(c)} className={`rounded px-2 py-1 text-xs ${c.ativo ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-slate-400"}`}>{c.ativo ? "Sim" : "Não"}</button></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Nenhuma cobrança recorrente.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">As faturas mensais são geradas pelo cron <code>/api/cron/cobrancas</code> (chame 1x por dia).</p>
      {novo && <NovaCobrancaModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
    </div>
  );
}
function NovaCobrancaModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [contas, setContas] = useState<Anunc[]>([]);
  const [contaId, setContaId] = useState(""); const [nome, setNome] = useState(""); const [valor, setValor] = useState(""); const [dia, setDia] = useState("10");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { aapi(token, "/api/admin/anunciantes").then(r => r.json()).then(d => d.ok && setContas(d.anunciantes)); }, [token]);
  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/cobrancas", { method: "POST", body: JSON.stringify({ conta_id: contaId, nome, valor_mensal: Number(valor), dia_vencimento: Number(dia) }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal onClose={onClose} title="Nova cobrança recorrente">
      <label className="mb-1 block text-sm text-slate-300">Anunciante</label>
      <select value={contaId} onChange={e => setContaId(e.target.value)} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
        <option value="">Selecione…</option>
        {contas.map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
      </select>
      <Field label="Descrição" value={nome} onChange={setNome} placeholder="ex: Aluguel mensal de tela" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor mensal (R$)" value={valor} onChange={setValor} type="number" />
        <Field label="Dia de vencimento (1–28)" value={dia} onChange={setDia} type="number" />
      </div>
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy || !contaId || !nome || !valor} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar</button>
    </Modal>
  );
}

// ─── Afiliados ───────────────────────────────────────────────────────────────
interface Afi { id: string; nome: string; email: string; codigo: string; comissao_pct: string; pix_chave: string | null; ativo: boolean; indicados: number | string; comissao_total: string; comissao_paga: string; comissao_pendente: string; }
interface Comissao { id: string; afiliado: string; empresa: string; campanha: string | null; base: string; pct: string; valor: string; status: string; created_at: string; }
export function Afiliados({ token }: { token: string }) {
  const [lista, setLista] = useState<Afi[]>([]);
  const [coms, setComs] = useState<Comissao[]>([]);
  const [novo, setNovo] = useState(false);
  const [verCom, setVerCom] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/afiliados"); const d = await r.json(); if (d.ok) setLista(d.afiliados); }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (verCom) aapi(token, `/api/admin/comissoes?afiliado_id=${verCom}`).then(r => r.json()).then(d => d.ok && setComs(d.comissoes)); }, [verCom, token]);
  async function setStatusCom(id: string, status: string) {
    await aapi(token, "/api/admin/comissoes", { method: "PATCH", body: JSON.stringify({ id, status }) });
    if (verCom) aapi(token, `/api/admin/comissoes?afiliado_id=${verCom}`).then(r => r.json()).then(d => d.ok && setComs(d.comissoes));
    load();
  }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Afiliados</h2>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo afiliado</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Código</th><th className="p-3">Nome</th><th className="p-3">Comissão</th><th className="p-3">Indicados</th><th className="p-3">Pendente</th><th className="p-3">Paga</th><th className="p-3"></th></tr></thead>
          <tbody>
            {lista.map(a => (
              <tr key={a.id} className="border-t border-white/5">
                <td className="p-3 font-mono">{a.codigo}</td>
                <td className="p-3">{a.nome}<div className="text-xs text-slate-500">{a.email}</div></td>
                <td className="p-3">{Number(a.comissao_pct)}%</td>
                <td className="p-3">{a.indicados}</td>
                <td className="p-3">{brl(Number(a.comissao_pendente))}</td>
                <td className="p-3">{brl(Number(a.comissao_paga))}</td>
                <td className="p-3 text-right"><button onClick={() => setVerCom(verCom === a.id ? null : a.id)} className="rounded border border-white/15 px-2 py-1 text-xs hover:bg-white/5">{verCom === a.id ? "Fechar" : "Comissões"}</button></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Nenhum afiliado.</td></tr>}
          </tbody>
        </table>
      </div>
      {verCom && (
        <div className="mt-6 rounded-xl border border-white/10 p-4">
          <p className="mb-3 font-medium">Comissões deste afiliado</p>
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-2">Data</th><th className="p-2">Empresa</th><th className="p-2">Campanha</th><th className="p-2">Base</th><th className="p-2">%</th><th className="p-2">Valor</th><th className="p-2">Status</th><th></th></tr></thead>
            <tbody>
              {coms.map(c => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="p-2 text-xs">{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="p-2">{c.empresa}</td>
                  <td className="p-2 text-xs">{c.campanha ?? "—"}</td>
                  <td className="p-2">{brl(Number(c.base))}</td>
                  <td className="p-2">{Number(c.pct)}%</td>
                  <td className="p-2 font-medium">{brl(Number(c.valor))}</td>
                  <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs ${c.status === "paga" ? "bg-emerald-500/20 text-emerald-300" : c.status === "cancelada" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>{c.status}</span></td>
                  <td className="p-2 text-right text-xs">
                    {c.status === "pendente" && <button onClick={() => setStatusCom(c.id, "paga")} className="mr-1 rounded border border-emerald-500/30 px-2 py-1 text-emerald-300 hover:bg-emerald-500/10">Pagar</button>}
                    {c.status === "pendente" && <button onClick={() => setStatusCom(c.id, "cancelada")} className="rounded border border-red-500/30 px-2 py-1 text-red-300 hover:bg-red-500/10">Cancelar</button>}
                  </td>
                </tr>
              ))}
              {!coms.length && <tr><td colSpan={8} className="p-4 text-center text-slate-500">Sem comissões.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {novo && <NovoAfiliadoModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
    </div>
  );
}
function NovoAfiliadoModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(""); const [email, setEmail] = useState(""); const [whats, setWhats] = useState("");
  const [codigo, setCodigo] = useState(""); const [pct, setPct] = useState("10"); const [pix, setPix] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/afiliados", { method: "POST", body: JSON.stringify({ nome, email, whatsapp: whats || undefined, codigo: codigo.toUpperCase(), comissao_pct: Number(pct), pix_chave: pix || undefined }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal onClose={onClose} title="Novo afiliado">
      <Field label="Nome" value={nome} onChange={setNome} />
      <Field label="E-mail" value={email} onChange={setEmail} type="email" />
      <div className="grid grid-cols-2 gap-3"><Field label="WhatsApp" value={whats} onChange={setWhats} /><Field label="Código" value={codigo} onChange={v => setCodigo(v.toUpperCase())} placeholder="ex: JOAO10" /></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Comissão (%)" value={pct} onChange={setPct} type="number" /><Field label="Chave PIX (pagamento)" value={pix} onChange={setPix} /></div>
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy || !nome || !email || !codigo} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Cadastrar</button>
      <p className="mt-2 text-xs text-slate-500">Pra vincular um anunciante a este afiliado, informe o código (campo opcional) na hora de cadastrar o anunciante.</p>
    </Modal>
  );
}

// ─── Backups ─────────────────────────────────────────────────────────────────
interface Backup { id: string; tipo: string; tamanho_bytes: string | null; caminho: string | null; sha256: string | null; status: string; mensagem: string | null; criado_em: string; }
export function Backups({ token }: { token: string }) {
  const [lista, setLista] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/historico-backups"); const d = await r.json(); if (d.ok) setLista(d.backups); }, [token]);
  useEffect(() => { load(); }, [load]);
  async function rodar() {
    setBusy(true);
    const r = await aapi(token, "/api/admin/historico-backups", { method: "POST" });
    const d = await r.json(); setBusy(false);
    notify(d.ok ? "Backup executado" : (d.error || (d.erros?.join("; ")) || "Erro"), d.ok ? "success" : "error");
    load();
  }
  const fmtSize = (n: number | null) => !n ? "—" : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : n < 1024 * 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Backups</h2>
        <button onClick={rodar} disabled={busy} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} Rodar backup agora</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Quando</th><th className="p-3">Tipo</th><th className="p-3">Tamanho</th><th className="p-3">Caminho</th><th className="p-3">SHA</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {lista.map(b => (
              <tr key={b.id} className="border-t border-white/5">
                <td className="p-3 text-xs">{new Date(b.criado_em).toLocaleString("pt-BR")}</td>
                <td className="p-3 capitalize">{b.tipo}</td>
                <td className="p-3 text-xs">{fmtSize(b.tamanho_bytes ? Number(b.tamanho_bytes) : null)}</td>
                <td className="p-3 font-mono text-[11px] text-slate-400">{b.caminho ?? "—"}</td>
                <td className="p-3 font-mono text-[10px] text-slate-500">{b.sha256 ? b.sha256.slice(0, 16) + "…" : "—"}</td>
                <td className="p-3"><span className={`rounded px-2 py-0.5 text-xs ${b.status === "ok" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>{b.status}</span>{b.mensagem && <div className="text-[10px] text-red-300">{b.mensagem.slice(0, 100)}</div>}</td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Nenhum backup ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-slate-400">
        <p className="mb-1 font-medium text-slate-200">Como agendar (crontab no host):</p>
        <pre className="rounded bg-black/40 p-2 text-[11px]">{`0 3 * * * curl -s "https://midia.tthreedigital.com.br/api/cron/backup?key=$CRON_SECRET" > /dev/null
0 4 * * * curl -s "https://midia.tthreedigital.com.br/api/cron/cobrancas?key=$CRON_SECRET" > /dev/null`}</pre>
        <p className="mt-2">Variáveis do container: <code>BACKUP_DIR</code> (default <code>/backups</code>), <code>BACKUP_LIB_PATH</code> (opcional, ex: <code>/var/www/xibo/library</code>), <code>BACKUP_RETENTION_DIAS</code> (default 14). O container precisa de <code>pg_dump</code> instalado e ter acesso à pasta.</p>
      </div>
    </div>
  );
}

// ─── Arquivados (campanhas encerradas, locais e anunciantes inativos) ──────
interface ArqItem { id: string; archived_at: string; dias_ate_purge: number; }
interface ArqCampanha extends ArqItem { nome: string; status: string; data_fim: string | null; empresa: string | null; }
interface ArqLocal    extends ArqItem { nome: string; cidade: string | null; }
interface ArqAnunc    extends ArqItem { empresa: string; nome: string; email: string; status: string; }

function diasTexto(d: number) {
  if (d <= 0) return "purge a qualquer momento";
  if (d <= 7) return `⚠ purge em ${d}d`;
  if (d <= 30) return `${d}d até purge`;
  return `${d}d até purge`;
}

export function Arquivados({ token }: { token: string }) {
  const [d, setD] = useState<{ campanhas: ArqCampanha[]; locais: ArqLocal[]; anunciantes: ArqAnunc[] } | null>(null);
  const [busy, setBusy] = useState<string>("");
  const load = useCallback(async () => {
    const r = await aapi(token, "/api/admin/arquivados"); const x = await r.json();
    if (x.ok) setD({ campanhas: x.campanhas, locais: x.locais, anunciantes: x.anunciantes });
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function acao(tipo: string, id: string, acao: "reativar" | "excluir") {
    if (acao === "excluir") {
      const ok = await confirmModal(`Excluir DEFINITIVAMENTE este ${tipo}? Essa ação não pode ser desfeita.`);
      if (!ok) return;
    }
    setBusy(`${tipo}-${id}`);
    const r = await aapi(token, "/api/admin/arquivados", { method: "PATCH", body: JSON.stringify({ tipo, id, acao }) });
    const x = await r.json(); setBusy("");
    notify(x.ok ? x.msg : (x.error || "Erro"), x.ok ? "success" : "error");
    if (x.ok) load();
  }

  if (!d) return <Loader2 className="h-6 w-6 animate-spin text-slate-500" />;

  const Sec = ({ titulo, count, children }: { titulo: string; count: number; children: React.ReactNode }) => (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><Archive className="h-4 w-4" /> {titulo} ({count})</h3>
      {count === 0 ? <p className="text-xs text-slate-500">Nenhum item arquivado.</p> : children}
    </div>
  );
  const Acoes = ({ tipo, id }: { tipo: string; id: string }) => (
    <div className="flex gap-1">
      <button disabled={busy === `${tipo}-${id}`} onClick={() => acao(tipo, id, "reativar")} className="flex items-center gap-1 rounded border border-emerald-500/30 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50" title="Reativar">
        {busy === `${tipo}-${id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Reativar
      </button>
      <button disabled={busy === `${tipo}-${id}`} onClick={() => acao(tipo, id, "excluir")} className="flex items-center gap-1 rounded border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50" title="Excluir definitivo">
        <Trash2 className="h-3 w-3" /> Excluir
      </button>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Arquivados</h2>
          <p className="text-xs text-slate-400">Campanhas encerradas, locais/anunciantes desativados. <strong>Purge automático após 6 meses.</strong> Reative se ainda quiser usar.</p>
        </div>
      </div>

      <Sec titulo="Campanhas encerradas" count={d.campanhas.length}>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-2">Nome</th><th className="p-2">Anunciante</th><th className="p-2">Status</th><th className="p-2">Arquivada em</th><th className="p-2">Purge</th><th className="p-2"></th></tr></thead>
            <tbody>
              {d.campanhas.map(c => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="p-2">{c.nome}</td>
                  <td className="p-2 text-xs text-slate-400">{c.empresa ?? "—"}</td>
                  <td className="p-2 text-xs">{c.status}</td>
                  <td className="p-2 text-xs text-slate-400">{new Date(c.archived_at).toLocaleDateString("pt-BR")}</td>
                  <td className={`p-2 text-xs ${c.dias_ate_purge <= 7 ? "text-amber-300" : "text-slate-400"}`}>{diasTexto(c.dias_ate_purge)}</td>
                  <td className="p-2 text-right"><Acoes tipo="campanha" id={c.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      <Sec titulo="Locais desativados" count={d.locais.length}>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-2">Nome</th><th className="p-2">Cidade</th><th className="p-2">Arquivado em</th><th className="p-2">Purge</th><th className="p-2"></th></tr></thead>
            <tbody>
              {d.locais.map(l => (
                <tr key={l.id} className="border-t border-white/5">
                  <td className="p-2">{l.nome}</td>
                  <td className="p-2 text-xs text-slate-400">{l.cidade ?? "—"}</td>
                  <td className="p-2 text-xs text-slate-400">{new Date(l.archived_at).toLocaleDateString("pt-BR")}</td>
                  <td className={`p-2 text-xs ${l.dias_ate_purge <= 7 ? "text-amber-300" : "text-slate-400"}`}>{diasTexto(l.dias_ate_purge)}</td>
                  <td className="p-2 text-right"><Acoes tipo="local" id={l.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      <Sec titulo="Anunciantes inativos" count={d.anunciantes.length}>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-2">Empresa</th><th className="p-2">Contato</th><th className="p-2">Arquivado em</th><th className="p-2">Purge</th><th className="p-2"></th></tr></thead>
            <tbody>
              {d.anunciantes.map(a => (
                <tr key={a.id} className="border-t border-white/5">
                  <td className="p-2">{a.empresa}</td>
                  <td className="p-2 text-xs text-slate-400">{a.nome} · {a.email}</td>
                  <td className="p-2 text-xs text-slate-400">{new Date(a.archived_at).toLocaleDateString("pt-BR")}</td>
                  <td className={`p-2 text-xs ${a.dias_ate_purge <= 7 ? "text-amber-300" : "text-slate-400"}`}>{diasTexto(a.dias_ate_purge)}</td>
                  <td className="p-2 text-right"><Acoes tipo="anunciante" id={a.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
        <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Sobre o purge automático</p>
        <p className="mt-1">Itens com mais de <strong>6 meses</strong> arquivados são apagados definitivamente pelo cron <code>/api/cron/limpeza-arquivados</code> (executado 1x/dia). Pra preservar, reative antes desse prazo.</p>
      </div>
    </div>
  );
}
