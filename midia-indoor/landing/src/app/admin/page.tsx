"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2, LogOut, LayoutDashboard, Users, Package, FileText, UserCog,
  Tv, Search, Plus, X, RefreshCw, MapPin, Megaphone, Upload, PlayCircle, StopCircle, BarChart3,
  LifeBuoy, Send,
} from "lucide-react";

const TOKEN_KEY = "midia_admin_token";
function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
}
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Aba = "dashboard" | "campanhas" | "anunciantes" | "locais" | "pacotes" | "chamados" | "contratos" | "usuarios";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole]   = useState<string>("");
  const [nome, setNome]   = useState<string>("");
  const [aba, setAba]     = useState<Aba>("dashboard");
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    setToken(t);
    setRole(localStorage.getItem("midia_admin_role") ?? "");
    setNome(localStorage.getItem("midia_admin_nome") ?? "");
    setPronto(true);
  }, []);

  function sair() {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem("midia_admin_role"); localStorage.removeItem("midia_admin_nome");
    setToken(null);
  }

  if (!pronto) return <Splash />;
  if (!token) return <Login onLogin={(t, r, n) => { setToken(t); setRole(r); setNome(n); }} />;

  const isMaster = role === "master";
  const abas: { id: Aba; label: string; icon: typeof LayoutDashboard; master?: boolean }[] = [
    { id: "dashboard",   label: "Dashboard",   icon: LayoutDashboard },
    { id: "campanhas",   label: "Campanhas",   icon: Megaphone },
    { id: "anunciantes", label: "Anunciantes", icon: Users },
    { id: "locais",      label: "Locais",      icon: MapPin, master: true },
    { id: "pacotes",     label: "Pacotes",     icon: Package, master: true },
    { id: "chamados",    label: "Chamados",    icon: LifeBuoy },
    { id: "contratos",   label: "Contratos",   icon: FileText, master: true },
    { id: "usuarios",    label: "Usuários",    icon: UserCog, master: true },
  ];

  return (
    <main className="min-h-screen bg-[#0a0a12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0a12]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2 text-brand-light">
            <Tv className="h-5 w-5" /><span className="font-bold">Admin · Three Digital Mídia</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">{nome} · <span className="capitalize">{role}</span></span>
            <button onClick={sair} className="flex items-center gap-1 text-slate-400 hover:text-white"><LogOut className="h-4 w-4" /> Sair</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {abas.filter(a => !a.master || isMaster).map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${aba === a.id ? "bg-brand text-white" : "text-slate-400 hover:bg-white/5"}`}>
              <a.icon className="h-4 w-4" /> {a.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {aba === "dashboard"   && <Dashboard token={token} />}
        {aba === "campanhas"   && <Campanhas token={token} isMaster={isMaster} />}
        {aba === "anunciantes" && <Anunciantes token={token} isMaster={isMaster} />}
        {aba === "locais"      && <Locais token={token} />}
        {aba === "pacotes"     && <Pacotes token={token} />}
        {aba === "chamados"    && <Chamados token={token} />}
        {aba === "contratos"   && <Contratos token={token} />}
        {aba === "usuarios"    && <Usuarios token={token} />}
      </div>
    </main>
  );
}

function Splash() {
  return <div className="flex min-h-screen items-center justify-center bg-[#0a0a12] text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
}

function Login({ onLogin }: { onLogin: (t: string, role: string, nome: string) => void }) {
  const [email, setEmail] = useState(""); const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha }) });
      const d = await r.json();
      if (!d.ok) { setErr(d.error || "Credenciais inválidas"); return; }
      localStorage.setItem(TOKEN_KEY, d.token);
      localStorage.setItem("midia_admin_role", d.admin.role);
      localStorage.setItem("midia_admin_nome", d.admin.nome);
      onLogin(d.token, d.admin.role, d.admin.nome);
    } catch { setErr("Erro de conexão"); } finally { setBusy(false); }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a12] text-white">
      <form onSubmit={entrar} className="w-full max-w-sm px-6">
        <div className="mb-8 flex items-center justify-center gap-2 text-brand-light">
          <Tv className="h-7 w-7" /><span className="text-lg font-bold">Admin · Three Digital Mídia</span>
        </div>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="E-mail"
          className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-brand/50" />
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required placeholder="Senha"
          className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-brand/50" />
        {err && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{err}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold hover:bg-brand-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Entrar
        </button>
      </form>
    </main>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────
function Dashboard({ token }: { token: string }) {
  const [d, setD] = useState<{ kpis: Record<string, number>; por_status: Record<string, number>; ultimas: { empresa: string; nome: string; email: string; status: string; created_at: string }[] } | null>(null);
  useEffect(() => { aapi(token, "/api/admin/dashboard").then(r => r.json()).then(x => x.ok && setD(x)); }, [token]);
  if (!d) return <Loader2 className="h-6 w-6 animate-spin text-slate-500" />;
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Clientes" value={String(d.kpis.contas)} />
        <Kpi label="Assinaturas ativas" value={String(d.kpis.assinaturas_ativas)} />
        <Kpi label="MRR (receita/mês)" value={brl(d.kpis.mrr)} />
        <Kpi label="Telas" value={String(d.kpis.telas)} />
      </div>
      <h2 className="mt-8 mb-3 text-lg font-bold">Últimos cadastros</h2>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Empresa</th><th className="p-3">Contato</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {d.ultimas.map((c, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="p-3 font-medium">{c.empresa}</td>
                <td className="p-3 text-slate-400">{c.nome}<br /><span className="text-xs">{c.email}</span></td>
                <td className="p-3"><Badge s={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-brand-light">{value}</p></div>;
}
function Badge({ s }: { s: string }) {
  const m: Record<string, string> = { ativo: "text-emerald-300", ativa: "text-emerald-300", pendente: "text-amber-300", suspenso: "text-red-300", cancelado: "text-slate-400" };
  return <span className={`text-xs font-medium capitalize ${m[s] ?? "text-slate-400"}`}>{s}</span>;
}

// ─── Tipos compartilhados ────────────────────────────────────────────────────
interface Local   { id: string; nome: string; cidade: string | null; endereco: string | null; largura: number; altura: number; xibo_display_group_id: number | null; ativo: boolean; }
interface Pacote  { id: string; nome: string; tipo: string; dias: number; insercoes_dia: number; segundos: number; preco: number; ativo: boolean; ordem: number; }
interface Anunc   { id: string; nome: string; empresa: string; email: string; whatsapp: string | null; status: string; campanhas: number; }
interface Camp    { id: string; nome: string; tipo: string; dias: number; insercoes_dia: number; segundos: number; data_inicio: string | null; data_fim: string | null; valor: string; status: string; status_pagamento: string; xibo_campaign_id: number | null; arte_nome: string | null; empresa: string; anunciante: string; locais: number; }

const STATUS_CAMP: Record<string, string> = { rascunho: "text-slate-400", aguardando_arte: "text-amber-300", no_ar: "text-emerald-300", pausada: "text-amber-300", encerrada: "text-slate-500" };
const TIPO_LABEL: Record<string, string> = { video: "Vídeo", banner_estatico: "Banner estático", banner_eletronico: "Banner eletrônico", peca: "Peça publicitária" };

// ─── Campanhas ────────────────────────────────────────────────────────────────
function Campanhas({ token, isMaster }: { token: string; isMaster: boolean }) {
  const [camps, setCamps] = useState<Camp[]>([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState(false);
  const [detalhe, setDetalhe] = useState<Camp | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const r = await aapi(token, "/api/admin/campanhas"); const d = await r.json();
    if (d.ok) setCamps(d.campanhas); setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Campanhas</h2>
        <div className="flex gap-2">
          <button onClick={load} className="rounded-xl border border-white/10 p-2 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
          {isMaster && <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Nova campanha</button>}
        </div>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin text-slate-500" /> : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-slate-400"><tr>
              <th className="p-3">Campanha / Anunciante</th><th className="p-3">Tipo</th><th className="p-3">Inserções</th>
              <th className="p-3">Período</th><th className="p-3">Locais</th><th className="p-3">Status</th><th className="p-3">Pgto</th>
            </tr></thead>
            <tbody>
              {camps.map(c => (
                <tr key={c.id} className="cursor-pointer border-t border-white/5 hover:bg-white/5" onClick={() => setDetalhe(c)}>
                  <td className="p-3"><div className="font-medium">{c.nome}</div><div className="text-xs text-slate-400">{c.empresa}</div></td>
                  <td className="p-3 text-xs">{TIPO_LABEL[c.tipo] ?? c.tipo}</td>
                  <td className="p-3 text-xs">{c.insercoes_dia}/dia · {c.segundos}s</td>
                  <td className="p-3 text-xs">{c.data_inicio ?? "—"}{c.data_fim ? ` → ${c.data_fim}` : ""}</td>
                  <td className="p-3">{c.locais}</td>
                  <td className="p-3"><span className={`text-xs font-medium capitalize ${STATUS_CAMP[c.status] ?? ""}`}>{c.status.replace("_", " ")}</span></td>
                  <td className="p-3"><span className={`text-xs ${c.status_pagamento === "pago" ? "text-emerald-300" : c.status_pagamento === "isento" ? "text-slate-400" : "text-amber-300"}`}>{c.status_pagamento}</span></td>
                </tr>
              ))}
              {!camps.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Nenhuma campanha ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {novo && <NovaCampanhaModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
      {detalhe && <CampanhaDetalhe token={token} camp={detalhe} isMaster={isMaster} onClose={() => setDetalhe(null)} onChange={load} />}
    </div>
  );
}

function NovaCampanhaModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [anuncs, setAnuncs] = useState<Anunc[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [contaId, setContaId] = useState(""); const [pacoteId, setPacoteId] = useState("");
  const [nome, setNome] = useState(""); const [valor, setValor] = useState("");
  const [inicio, setInicio] = useState(""); const [fim, setFim] = useState("");
  const [selLocais, setSelLocais] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  useEffect(() => {
    aapi(token, "/api/admin/anunciantes").then(r => r.json()).then(d => d.ok && setAnuncs(d.anunciantes));
    aapi(token, "/api/admin/pacotes").then(r => r.json()).then(d => d.ok && setPacotes(d.pacotes.filter((p: Pacote) => p.ativo)));
    aapi(token, "/api/admin/locais").then(r => r.json()).then(d => d.ok && setLocais(d.locais.filter((l: Local) => l.ativo)));
  }, [token]);

  // Ao escolher pacote, sugere datas a partir de hoje
  useEffect(() => {
    const pac = pacotes.find(p => p.id === pacoteId);
    if (pac && inicio) {
      const d = new Date(inicio + "T00:00:00"); d.setDate(d.getDate() + pac.dias - 1);
      setFim(d.toISOString().slice(0, 10));
    }
  }, [pacoteId, inicio, pacotes]);

  function toggleLocal(id: string) { setSelLocais(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }

  async function salvar() {
    setBusy(true); setErr("");
    const body = { conta_id: contaId, nome, pacote_id: pacoteId || undefined, data_inicio: inicio || undefined, data_fim: fim || undefined, valor: valor || 0, locais: selLocais };
    const r = await aapi(token, "/api/admin/campanhas", { method: "POST", body: JSON.stringify(body) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }

  return (
    <Modal onClose={onClose} title="Nova campanha" wide>
      <label className="mb-1 block text-sm text-slate-300">Anunciante</label>
      <select value={contaId} onChange={e => setContaId(e.target.value)} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
        <option value="">{anuncs.length ? "Selecione…" : "Cadastre um anunciante antes"}</option>
        {anuncs.map(a => <option key={a.id} value={a.id}>{a.empresa} — {a.nome}</option>)}
      </select>
      <Field label="Nome da campanha" value={nome} onChange={setNome} placeholder="ex: Promoção de inverno" />
      <label className="mb-1 block text-sm text-slate-300">Pacote</label>
      <select value={pacoteId} onChange={e => setPacoteId(e.target.value)} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
        <option value="">Selecione um pacote…</option>
        {pacotes.map(p => <option key={p.id} value={p.id}>{p.nome} · {p.insercoes_dia}/dia · {p.segundos}s</option>)}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Início" value={inicio} onChange={setInicio} type="date" />
        <Field label="Fim" value={fim} onChange={setFim} type="date" />
      </div>
      <Field label="Valor (R$)" value={valor} onChange={setValor} type="number" />
      <label className="mb-1 block text-sm text-slate-300">Locais ({selLocais.length} selecionados)</label>
      <div className="mb-3 max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-2">
        {locais.map(l => (
          <label key={l.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/5">
            <input type="checkbox" checked={selLocais.includes(l.id)} onChange={() => toggleLocal(l.id)} />
            <span>{l.nome}{l.cidade ? <span className="text-slate-500"> · {l.cidade}</span> : null}</span>
          </label>
        ))}
        {!locais.length && <p className="p-2 text-xs text-slate-500">Cadastre locais antes.</p>}
      </div>
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy || !contaId || !selLocais.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar campanha</button>
    </Modal>
  );
}

function CampanhaDetalhe({ token, camp, isMaster, onClose, onChange }: { token: string; camp: Camp; isMaster: boolean; onClose: () => void; onChange: () => void }) {
  const [det, setDet] = useState<{ campanha: Camp & { data_inicio: string | null; data_fim: string | null; valor: string }; locais: Local[]; relatorio: { plays: number; duracao: number } | null } | null>(null);
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await aapi(token, `/api/admin/campanhas/${camp.id}`); const d = await r.json();
    if (d.ok) setDet(d);
  }, [token, camp.id]);
  useEffect(() => { load(); }, [load]);

  async function acao(path: string, label: string) {
    setBusy(label); setMsg("");
    const r = await aapi(token, `/api/admin/campanhas/${camp.id}/${path}`, { method: "POST" });
    const d = await r.json(); setBusy("");
    if (!d.ok) { setMsg(d.error || "Erro"); return; }
    load(); onChange();
  }
  async function enviarArte(file: File) {
    setBusy("arte"); setMsg("");
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch(`/api/admin/campanhas/${camp.id}/arte`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const d = await r.json(); setBusy("");
    if (!d.ok) { setMsg(d.error || "Erro no upload"); return; }
    load(); onChange();
  }
  async function marcarPgto(status: string) {
    await aapi(token, `/api/admin/campanhas/${camp.id}`, { method: "PATCH", body: JSON.stringify({ status_pagamento: status }) });
    load(); onChange();
  }

  const c = det?.campanha;
  return (
    <Modal onClose={onClose} title={camp.nome} wide>
      {!c ? <Loader2 className="h-6 w-6 animate-spin text-slate-500" /> : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Info label="Anunciante" v={camp.empresa} />
            <Info label="Tipo" v={TIPO_LABEL[camp.tipo] ?? camp.tipo} />
            <Info label="Inserções/dia" v={`${camp.insercoes_dia} · ${camp.segundos}s`} />
            <Info label="Período" v={`${c.data_inicio ?? "—"} → ${c.data_fim ?? "—"}`} />
            <Info label="Valor" v={brl(Number(c.valor))} />
            <Info label="Status" v={c.status.replace("_", " ")} />
          </div>

          <div>
            <p className="mb-1 text-slate-400">Locais ({det.locais.length})</p>
            <div className="flex flex-wrap gap-1">{det.locais.map(l => <span key={l.id} className="rounded bg-white/5 px-2 py-1 text-xs">{l.nome}</span>)}</div>
          </div>

          {det.relatorio && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="flex items-center gap-2 font-medium text-emerald-300"><BarChart3 className="h-4 w-4" /> Proof-of-play</p>
              <p className="mt-1 text-slate-300">{det.relatorio.plays} exibições · {Math.round(det.relatorio.duracao)}s no total</p>
            </div>
          )}

          {msg && <p className="text-sm text-red-400">{msg}</p>}

          {isMaster && (
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
                {busy === "arte" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {camp.arte_nome ? "Trocar arte" : "Enviar arte"}
                <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) enviarArte(f); }} />
              </label>
              <button onClick={() => acao("lancar", "lancar")} disabled={!!busy} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50">
                {busy === "lancar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} {camp.status === "no_ar" ? "Reaplicar" : "Lançar no ar"}
              </button>
              <button onClick={() => acao("encerrar", "encerrar")} disabled={!!busy} className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                {busy === "encerrar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />} Encerrar
              </button>
              {camp.status === "no_ar" && (
                <button onClick={async () => { setBusy("rel-email"); setMsg(""); const r = await aapi(token, `/api/admin/campanhas/${camp.id}/relatorio-email`, { method: "POST" }); const d = await r.json(); setBusy(""); setMsg(d.ok ? "Relatório enviado por e-mail ✓" : (d.error || "Erro")); }} disabled={!!busy} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50">
                  {busy === "rel-email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar relatório por e-mail
                </button>
              )}
              <div className="ml-auto flex items-center gap-1 text-xs">
                <span className="text-slate-400">Pgto:</span>
                {["pago", "pendente", "isento"].map(s => (
                  <button key={s} onClick={() => marcarPgto(s)} className={`rounded px-2 py-1 ${c.status_pagamento === s ? "bg-brand text-white" : "border border-white/15 hover:bg-white/5"}`}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {camp.arte_nome && <p className="text-xs text-slate-500">Arte atual: {camp.arte_nome}</p>}
        </div>
      )}
    </Modal>
  );
}
function Info({ label, v }: { label: string; v: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="font-medium capitalize">{v}</p></div>;
}

// ─── Anunciantes ────────────────────────────────────────────────────────────
function Anunciantes({ token, isMaster }: { token: string; isMaster: boolean }) {
  const [lista, setLista] = useState<Anunc[]>([]);
  const [q, setQ] = useState(""); const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState(false);
  const [contratoFor, setContratoFor] = useState<Anunc | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const r = await aapi(token, `/api/admin/anunciantes?q=${encodeURIComponent(q)}`); const d = await r.json();
    if (d.ok) setLista(d.anunciantes); setLoading(false);
  }, [token, q]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar anunciante" className="w-full bg-transparent py-2 text-sm outline-none" />
        </div>
        {isMaster && <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo anunciante</button>}
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin text-slate-500" /> : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Empresa / Contato</th><th className="p-3">Campanhas</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
            <tbody>
              {lista.map(a => (
                <tr key={a.id} className="border-t border-white/5">
                  <td className="p-3"><div className="font-medium">{a.empresa}</div><div className="text-xs text-slate-400">{a.nome} · {a.email}{a.whatsapp ? ` · ${a.whatsapp}` : ""}</div></td>
                  <td className="p-3">{a.campanhas}</td>
                  <td className="p-3"><Badge s={a.status} /></td>
                  <td className="p-3 text-right">{isMaster && <button onClick={() => setContratoFor(a)} className="rounded border border-white/15 px-2 py-1 text-xs hover:bg-white/5">Contrato</button>}</td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nenhum anunciante.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {novo && <AnuncModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
      {contratoFor && <GerarContratoModal token={token} conta={{ id: contratoFor.id, empresa: contratoFor.empresa }} onClose={() => setContratoFor(null)} />}
    </div>
  );
}
function AnuncModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(""); const [empresa, setEmpresa] = useState(""); const [email, setEmail] = useState("");
  const [senha, setSenha] = useState(""); const [whatsapp, setWhatsapp] = useState(""); const [cidade, setCidade] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/anunciantes", { method: "POST", body: JSON.stringify({ nome, empresa, email, senha, whatsapp, cidade }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal onClose={onClose} title="Novo anunciante">
      <Field label="Empresa" value={empresa} onChange={setEmpresa} />
      <Field label="Nome do contato" value={nome} onChange={setNome} />
      <Field label="E-mail (login)" value={email} onChange={setEmail} type="email" />
      <Field label="Senha de acesso" value={senha} onChange={setSenha} type="password" placeholder="mínimo 6 caracteres" />
      <div className="grid grid-cols-2 gap-3"><Field label="WhatsApp" value={whatsapp} onChange={setWhatsapp} /><Field label="Cidade" value={cidade} onChange={setCidade} /></div>
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar</button>
      <p className="mt-2 text-xs text-slate-500">O anunciante acessa o /painel com esse e-mail e senha pra ver campanhas e enviar arte.</p>
    </Modal>
  );
}

// ─── Locais ─────────────────────────────────────────────────────────────────
function Locais({ token }: { token: string }) {
  const [lista, setLista] = useState<Local[]>([]);
  const [novo, setNovo] = useState(false);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/locais"); const d = await r.json(); if (d.ok) setLista(d.locais); }, [token]);
  useEffect(() => { load(); }, [load]);
  async function toggle(l: Local) { await aapi(token, "/api/admin/locais", { method: "PATCH", body: JSON.stringify({ id: l.id, ativo: !l.ativo }) }); load(); }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Locais (inventário)</h2>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo local</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {lista.map(l => (
          <div key={l.id} className={`rounded-2xl border p-4 ${l.ativo ? "border-white/10 bg-white/5" : "border-white/5 bg-white/[0.02] opacity-60"}`}>
            <div className="flex items-start justify-between">
              <div><p className="font-bold">{l.nome}</p><p className="text-xs text-slate-400">{l.cidade ?? ""}{l.endereco ? ` · ${l.endereco}` : ""}</p></div>
              <MapPin className="h-4 w-4 text-brand-light" />
            </div>
            <p className="mt-2 text-xs text-slate-500">{l.largura}×{l.altura} · grupo Xibo {l.xibo_display_group_id ?? "—"}</p>
            <button onClick={() => toggle(l)} className="mt-3 w-full rounded-lg border border-white/15 py-1.5 text-xs hover:bg-white/5">{l.ativo ? "Desativar" : "Ativar"}</button>
          </div>
        ))}
        {!lista.length && <p className="text-sm text-slate-500">Nenhum local. Cadastre seus pontos de mídia.</p>}
      </div>
      {novo && <LocalModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
    </div>
  );
}
function LocalModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(""); const [cidade, setCidade] = useState(""); const [endereco, setEndereco] = useState("");
  const [largura, setLargura] = useState("1080"); const [altura, setAltura] = useState("1920");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/locais", { method: "POST", body: JSON.stringify({ nome, cidade, endereco, largura, altura }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal onClose={onClose} title="Novo local">
      <Field label="Nome do ponto" value={nome} onChange={setNome} placeholder="ex: Shopping Centro - Praça" />
      <div className="grid grid-cols-2 gap-3"><Field label="Cidade" value={cidade} onChange={setCidade} /><Field label="Endereço" value={endereco} onChange={setEndereco} /></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Largura (px)" value={largura} onChange={setLargura} type="number" /><Field label="Altura (px)" value={altura} onChange={setAltura} type="number" /></div>
      <p className="mb-3 text-xs text-slate-500">Use 1080×1920 (retrato) ou 1920×1080 (paisagem) conforme as telas do local. Um Display Group é criado no Xibo automaticamente.</p>
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar local</button>
    </Modal>
  );
}

// ─── Pacotes ────────────────────────────────────────────────────────────────
function Pacotes({ token }: { token: string }) {
  const [lista, setLista] = useState<Pacote[]>([]);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<Pacote | null>(null);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/pacotes"); const d = await r.json(); if (d.ok) setLista(d.pacotes); }, [token]);
  useEffect(() => { load(); }, [load]);
  async function toggle(p: Pacote) { await aapi(token, "/api/admin/pacotes", { method: "PATCH", body: JSON.stringify({ id: p.id, ativo: !p.ativo }) }); load(); }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Pacotes de venda</h2>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo pacote</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {lista.map(p => (
          <div key={p.id} className={`rounded-2xl border p-4 ${p.ativo ? "border-white/10 bg-white/5" : "border-white/5 bg-white/[0.02] opacity-60"}`}>
            <p className="font-bold">{p.nome}</p>
            <p className="text-xs text-slate-400">{TIPO_LABEL[p.tipo] ?? p.tipo}</p>
            <p className="mt-2 text-sm">{p.insercoes_dia} inserções/dia · {p.segundos}s · {p.dias} dias</p>
            {Number(p.preco) > 0 && <p className="mt-1 text-lg font-black text-brand-light">{brl(Number(p.preco))}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => setEditar(p)} className="flex-1 rounded-lg border border-white/15 py-1.5 text-xs hover:bg-white/5">Editar</button>
              <button onClick={() => toggle(p)} className="flex-1 rounded-lg border border-white/15 py-1.5 text-xs hover:bg-white/5">{p.ativo ? "Desativar" : "Ativar"}</button>
            </div>
          </div>
        ))}
        {!lista.length && <p className="text-sm text-slate-500">Nenhum pacote.</p>}
      </div>
      {novo && <PacoteModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
      {editar && <PacoteModal token={token} pacote={editar} onClose={() => setEditar(null)} onSaved={() => { setEditar(null); load(); }} />}
    </div>
  );
}
function PacoteModal({ token, pacote, onClose, onSaved }: { token: string; pacote?: Pacote; onClose: () => void; onSaved: () => void }) {
  const editing = Boolean(pacote);
  const [nome, setNome] = useState(pacote?.nome ?? "");
  const [tipo, setTipo] = useState(pacote?.tipo ?? "video");
  const [dias, setDias] = useState(String(pacote?.dias ?? "15"));
  const [ins, setIns] = useState(String(pacote?.insercoes_dia ?? "250"));
  const [seg, setSeg] = useState(String(pacote?.segundos ?? "10"));
  const [preco, setPreco] = useState(String(pacote?.preco ?? ""));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function salvar() {
    setBusy(true); setErr("");
    const body = { nome, tipo, dias, insercoes_dia: ins, segundos: seg, preco: preco || 0 };
    const r = editing
      ? await aapi(token, "/api/admin/pacotes", { method: "PATCH", body: JSON.stringify({ id: pacote!.id, ...body }) })
      : await aapi(token, "/api/admin/pacotes", { method: "POST", body: JSON.stringify(body) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal onClose={onClose} title={editing ? "Editar pacote" : "Novo pacote"}>
      <Field label="Nome" value={nome} onChange={setNome} placeholder="ex: 15 dias · 250 inserções/dia" />
      <label className="mb-1 block text-sm text-slate-300">Tipo</label>
      <select value={tipo} onChange={e => setTipo(e.target.value)} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
        {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Dias" value={dias} onChange={setDias} type="number" />
        <Field label="Inserções/dia" value={ins} onChange={setIns} type="number" />
        <Field label="Segundos" value={seg} onChange={setSeg} type="number" />
      </div>
      <Field label="Preço (R$)" value={preco} onChange={setPreco} type="number" />
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar</button>
    </Modal>
  );
}

// ─── Contratos ────────────────────────────────────────────────────────────
interface Template { id: string; titulo: string; conteudo_html: string; versao: number; ativo: boolean; }
function Contratos({ token }: { token: string }) {
  const [tpls, setTpls] = useState<Template[]>([]);
  const [modelo, setModelo] = useState("");
  const [novo, setNovo] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/contratos/templates"); const d = await r.json(); if (d.ok) { setTpls(d.templates); setModelo(d.modelo_padrao); } }, [token]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Modelos de contrato</h2>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo modelo</button>
      </div>
      <p className="mb-4 text-xs text-slate-500">Placeholders: {"{{cliente_nome}} {{cliente_empresa}} {{cliente_email}} {{plano}} {{qtd_telas}} {{preco_tela}} {{total_mensal}} {{contratada_nome}} {{data_extenso}}"}</p>
      <div className="space-y-2">
        {tpls.map(t => (
          <div key={t.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div><span className="font-medium">{t.titulo}</span> <span className="text-xs text-slate-500">v{t.versao} · {t.ativo ? "ativo" : "inativo"}</span></div>
            <button onClick={() => setEditing(t)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5">Editar</button>
          </div>
        ))}
        {!tpls.length && <p className="text-sm text-slate-500">Nenhum modelo. Crie um a partir do modelo padrão.</p>}
      </div>
      {novo && <TemplateModal token={token} modeloPadrao={modelo} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
      {editing && <TemplateModal token={token} tpl={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
function TemplateModal({ token, tpl, modeloPadrao, onClose, onSaved }: { token: string; tpl?: Template; modeloPadrao?: string; onClose: () => void; onSaved: () => void }) {
  const editing = Boolean(tpl);
  const [titulo, setTitulo] = useState(tpl?.titulo ?? "Contrato de Prestação de Serviço");
  const [html, setHtml] = useState(tpl?.conteudo_html ?? modeloPadrao ?? "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function salvar() {
    setBusy(true); setErr("");
    const r = editing
      ? await aapi(token, "/api/admin/contratos/templates", { method: "PATCH", body: JSON.stringify({ id: tpl!.id, titulo, conteudo_html: html }) })
      : await aapi(token, "/api/admin/contratos/templates", { method: "POST", body: JSON.stringify({ titulo, conteudo_html: html }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal onClose={onClose} title={editing ? "Editar modelo" : "Novo modelo"} wide>
      <Field label="Título" value={titulo} onChange={setTitulo} />
      <label className="mb-1 block text-sm text-slate-300">Conteúdo (HTML com placeholders)</label>
      <textarea value={html} onChange={e => setHtml(e.target.value)} rows={14} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs outline-none focus:border-brand/50" />
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar</button>
    </Modal>
  );
}
function GerarContratoModal({ token, conta, onClose }: { token: string; conta: { id: string; empresa: string }; onClose: () => void }) {
  const [tpls, setTpls] = useState<Template[]>([]);
  const [sel, setSel] = useState(""); const [busy, setBusy] = useState(false);
  const [html, setHtml] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { aapi(token, "/api/admin/contratos/templates").then(r => r.json()).then(d => { if (d.ok) { setTpls(d.templates.filter((t: Template) => t.ativo)); } }); }, [token]);
  async function gerar() {
    if (!sel) { setErr("Escolha um modelo"); return; }
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/contratos", { method: "POST", body: JSON.stringify({ conta_id: conta.id, template_id: sel }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    setHtml(d.conteudo_html);
  }
  return (
    <Modal onClose={onClose} title={`Contrato — ${conta.empresa}`} wide>
      {!html ? (
        <>
          <label className="mb-1 block text-sm text-slate-300">Modelo</label>
          <select value={sel} onChange={e => setSel(e.target.value)} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
            <option value="">{tpls.length ? "Selecione…" : "Nenhum modelo ativo"}</option>
            {tpls.map(t => <option key={t.id} value={t.id}>{t.titulo}</option>)}
          </select>
          {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
          <button onClick={gerar} disabled={busy || !sel} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Gerar contrato</button>
        </>
      ) : (
        <>
          <div className="mb-3 max-h-[50vh] overflow-y-auto rounded-xl border border-white/10 bg-white p-5 text-sm text-black" dangerouslySetInnerHTML={{ __html: html }} />
          <button onClick={() => window.print()} className="w-full rounded-xl border border-white/15 py-2.5 text-sm hover:bg-white/5">Imprimir / Salvar PDF</button>
        </>
      )}
    </Modal>
  );
}

// ─── Usuários (admins) ──────────────────────────────────────────────────────
interface Usuario { id: string; nome: string; email: string; role: string; ativo: boolean; }
function Usuarios({ token }: { token: string }) {
  const [us, setUs] = useState<Usuario[]>([]);
  const [novo, setNovo] = useState(false);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/usuarios"); const d = await r.json(); if (d.ok) setUs(d.usuarios); }, [token]);
  useEffect(() => { load(); }, [load]);
  async function toggle(u: Usuario) { await aapi(token, "/api/admin/usuarios", { method: "PATCH", body: JSON.stringify({ id: u.id, ativo: !u.ativo }) }); load(); }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Usuários do admin</h2>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo usuário</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Nome</th><th className="p-3">E-mail</th><th className="p-3">Papel</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {us.map(u => (
              <tr key={u.id} className="border-t border-white/5">
                <td className="p-3 font-medium">{u.nome}</td><td className="p-3 text-slate-400">{u.email}</td>
                <td className="p-3 capitalize">{u.role}</td>
                <td className="p-3">{u.ativo ? <span className="text-emerald-300">ativo</span> : <span className="text-slate-500">inativo</span>}</td>
                <td className="p-3 text-right"><button onClick={() => toggle(u)} className="rounded border border-white/15 px-2 py-1 text-xs hover:bg-white/5">{u.ativo ? "Desativar" : "Ativar"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {novo && <UsuarioModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
    </div>
  );
}
function UsuarioModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(""); const [email, setEmail] = useState(""); const [senha, setSenha] = useState("");
  const [role, setRole] = useState("suporte"); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/usuarios", { method: "POST", body: JSON.stringify({ nome, email, senha, role }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal onClose={onClose} title="Novo usuário">
      <Field label="Nome" value={nome} onChange={setNome} />
      <Field label="E-mail" value={email} onChange={setEmail} type="email" />
      <Field label="Senha" value={senha} onChange={setSenha} type="password" placeholder="mínimo 6 caracteres" />
      <label className="mb-1 block text-sm text-slate-300">Papel</label>
      <select value={role} onChange={e => setRole(e.target.value)} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
        <option value="suporte">Suporte (só visualiza)</option>
        <option value="master">Master (controle total)</option>
      </select>
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar</button>
    </Modal>
  );
}

// ─── Chamados (suporte) ───────────────────────────────────────────────────
interface ChamadoAdmin { id: string; assunto: string; status: string; empresa: string; contato: string; ultima_msg: string | null; updated_at: string; }
interface MsgAdmin { autor: string; mensagem: string; created_at: string; }
function Chamados({ token }: { token: string }) {
  const [lista, setLista] = useState<ChamadoAdmin[]>([]);
  const [aberto, setAberto] = useState<ChamadoAdmin | null>(null);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/chamados"); const d = await r.json(); if (d.ok) setLista(d.chamados); }, [token]);
  useEffect(() => { load(); }, [load]);
  return (
    <div>
      <h2 className="mb-4 text-lg font-bold">Chamados de suporte</h2>
      <div className="space-y-2">
        {lista.map(c => (
          <button key={c.id} onClick={() => setAberto(c)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10">
            <div><p className="font-medium">{c.assunto}</p><p className="text-xs text-slate-400">{c.empresa} · {c.contato}{c.ultima_msg ? ` — ${c.ultima_msg.slice(0, 60)}` : ""}</p></div>
            <span className={`text-xs ${c.status === "aberto" ? "text-amber-300" : c.status === "respondido" ? "text-emerald-300" : "text-slate-500"}`}>{c.status}</span>
          </button>
        ))}
        {!lista.length && <p className="text-sm text-slate-500">Nenhum chamado.</p>}
      </div>
      {aberto && <ChatChamadoAdmin token={token} chamado={aberto} onClose={() => { setAberto(null); load(); }} />}
    </div>
  );
}
function ChatChamadoAdmin({ token, chamado, onClose }: { token: string; chamado: ChamadoAdmin; onClose: () => void }) {
  const [msgs, setMsgs] = useState<MsgAdmin[]>([]);
  const [txt, setTxt] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await aapi(token, `/api/admin/chamados?id=${chamado.id}`); const d = await r.json(); if (d.ok) setMsgs(d.mensagens); }, [token, chamado.id]);
  useEffect(() => { load(); }, [load]);
  async function responder(fechar: boolean) {
    if (!txt.trim() && !fechar) return;
    setBusy(true);
    await aapi(token, "/api/admin/chamados", { method: "POST", body: JSON.stringify({ chamado_id: chamado.id, mensagem: txt || "(chamado encerrado)", fechar }) });
    setTxt(""); setBusy(false); load();
  }
  return (
    <Modal title={`${chamado.assunto} — ${chamado.empresa}`} onClose={onClose} wide>
      <div className="mb-3 max-h-80 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <div key={i} className={`rounded-xl px-3 py-2 text-sm ${m.autor === "suporte" ? "ml-8 bg-brand/20" : "mr-8 bg-white/5"}`}>
            <p className="text-[11px] text-slate-400">{m.autor === "suporte" ? "Você (suporte)" : chamado.contato} · {new Date(m.created_at.replace(" ", "T")).toLocaleString("pt-BR")}</p>
            <p className="whitespace-pre-wrap">{m.mensagem}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === "Enter") responder(false); }} placeholder="Responder…" className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
        <button onClick={() => responder(false)} disabled={busy} className="rounded-xl bg-brand px-4 hover:bg-brand-dark disabled:opacity-50"><Send className="h-4 w-4" /></button>
      </div>
      <button onClick={() => responder(true)} disabled={busy} className="mt-2 w-full rounded-xl border border-white/15 py-2 text-xs hover:bg-white/5">Responder e encerrar chamado</button>
    </Modal>
  );
}

// ─── UI helpers ──────────────────────────────────────────────────────────────
function Modal({ children, title, onClose, wide }: { children: React.ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#12121c] p-6 ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm text-slate-300">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
    </div>
  );
}
