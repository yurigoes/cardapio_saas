"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, LogOut, LayoutDashboard, Users, Package, FileText, UserCog,
  Tv, Search, Plus, X, RefreshCw,
} from "lucide-react";

const TOKEN_KEY = "midia_admin_token";
function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
}
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Aba = "dashboard" | "contas" | "planos" | "usuarios" | "contratos";

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
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "contas",    label: "Clientes",  icon: Users },
    { id: "planos",    label: "Planos",    icon: Package, master: true },
    { id: "contratos", label: "Contratos", icon: FileText, master: true },
    { id: "usuarios",  label: "Usuários",  icon: UserCog, master: true },
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
        {aba === "dashboard" && <Dashboard token={token} />}
        {aba === "contas"    && <Contas token={token} isMaster={isMaster} />}
        {aba === "planos"    && <Planos token={token} />}
        {aba === "contratos" && <Contratos token={token} />}
        {aba === "usuarios"  && <Usuarios token={token} />}
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

// ─── Contas / Clientes ──────────────────────────────────────────────────────
interface Conta {
  id: string; nome: string; empresa: string; email: string; whatsapp: string | null; cidade: string | null;
  status: string; plano: string | null; preco_tela: string | null; qtd_telas: number | null;
  assinatura_status: string | null; telas: number; created_at: string;
}
function Contas({ token, isMaster }: { token: string; isMaster: boolean }) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [q, setQ] = useState(""); const [loading, setLoading] = useState(true);
  const [contratoFor, setContratoFor] = useState<Conta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await aapi(token, `/api/admin/contas?q=${encodeURIComponent(q)}`);
    const d = await r.json(); if (d.ok) setContas(d.contas);
    setLoading(false);
  }, [token, q]);
  useEffect(() => { load(); }, [load]);

  async function mudarStatus(c: Conta, status: string) {
    await aapi(token, "/api/admin/contas", { method: "PATCH", body: JSON.stringify({ conta_id: c.id, status }) });
    load();
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por empresa, nome ou e-mail"
            className="w-full bg-transparent py-2 text-sm outline-none" />
        </div>
        <button onClick={load} className="rounded-xl border border-white/10 p-2 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin text-slate-500" /> : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-slate-400"><tr>
              <th className="p-3">Empresa / Contato</th><th className="p-3">Plano</th><th className="p-3">Telas</th>
              <th className="p-3">Status</th><th className="p-3">Ações</th>
            </tr></thead>
            <tbody>
              {contas.map(c => (
                <tr key={c.id} className="border-t border-white/5 align-top">
                  <td className="p-3"><div className="font-medium">{c.empresa}</div><div className="text-xs text-slate-400">{c.nome} · {c.email}{c.whatsapp ? ` · ${c.whatsapp}` : ""}</div></td>
                  <td className="p-3 capitalize">{c.plano ?? "—"}{c.preco_tela ? <div className="text-xs text-slate-500">{brl(Number(c.preco_tela))}/tela</div> : null}</td>
                  <td className="p-3">{c.telas}/{c.qtd_telas ?? 0}</td>
                  <td className="p-3"><Badge s={c.status} />{c.assinatura_status ? <div className="text-xs text-slate-500">assin: {c.assinatura_status}</div> : null}</td>
                  <td className="p-3">
                    {isMaster && (
                      <div className="flex flex-wrap gap-1">
                        {c.status !== "ativo"     && <button onClick={() => mudarStatus(c, "ativo")} className="rounded border border-emerald-500/30 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10">Ativar</button>}
                        {c.status !== "suspenso"  && <button onClick={() => mudarStatus(c, "suspenso")} className="rounded border border-amber-500/30 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/10">Suspender</button>}
                        <button onClick={() => setContratoFor(c)} className="rounded border border-white/15 px-2 py-1 text-xs hover:bg-white/5">Contrato</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!contas.length && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Nenhum cliente.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {contratoFor && <GerarContratoModal token={token} conta={contratoFor} onClose={() => setContratoFor(null)} />}
    </div>
  );
}

// ─── Planos ─────────────────────────────────────────────────────────────────
interface PlanoAdmin { id: string; nome: string; preco: number; telas: string; destaque: boolean; recursos: string[]; ativo: boolean; ordem: number; }
function Planos({ token }: { token: string }) {
  const [planos, setPlanos] = useState<PlanoAdmin[]>([]);
  const [novo, setNovo] = useState(false);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/planos"); const d = await r.json(); if (d.ok) setPlanos(d.planos); }, [token]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Planos</h2>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo plano</button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {planos.map(p => <PlanoCard key={p.id} token={token} plano={p} onChange={load} />)}
      </div>
      {novo && <PlanoModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
    </div>
  );
}
function PlanoCard({ token, plano, onChange }: { token: string; plano: PlanoAdmin; onChange: () => void }) {
  const [edit, setEdit] = useState(false);
  async function toggle() {
    await aapi(token, `/api/admin/planos/${plano.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !plano.ativo }) });
    onChange();
  }
  return (
    <div className={`rounded-2xl border p-5 ${plano.ativo ? "border-white/10 bg-white/5" : "border-white/5 bg-white/[0.02] opacity-60"}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{plano.nome}{plano.destaque && <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-[10px]">DESTAQUE</span>}</h3>
        <span className="text-xs text-slate-500">{plano.ativo ? "ativo" : "inativo"}</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">{plano.telas}</p>
      <p className="mt-2 text-2xl font-black text-brand-light">{brl(plano.preco)}<span className="text-xs text-slate-400">/tela</span></p>
      <ul className="mt-3 space-y-1 text-xs text-slate-400">{plano.recursos.slice(0, 4).map((r, i) => <li key={i}>· {r}</li>)}</ul>
      <div className="mt-4 flex gap-2">
        <button onClick={() => setEdit(true)} className="flex-1 rounded-lg border border-white/15 py-1.5 text-xs hover:bg-white/5">Editar</button>
        <button onClick={toggle} className="flex-1 rounded-lg border border-white/15 py-1.5 text-xs hover:bg-white/5">{plano.ativo ? "Desativar" : "Ativar"}</button>
      </div>
      {edit && <PlanoModal token={token} plano={plano} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); onChange(); }} />}
    </div>
  );
}
function PlanoModal({ token, plano, onClose, onSaved }: { token: string; plano?: PlanoAdmin; onClose: () => void; onSaved: () => void }) {
  const editing = Boolean(plano);
  const [id, setId] = useState(plano?.id ?? "");
  const [nome, setNome] = useState(plano?.nome ?? "");
  const [preco, setPreco] = useState(String(plano?.preco ?? ""));
  const [telas, setTelas] = useState(plano?.telas ?? "");
  const [destaque, setDestaque] = useState(plano?.destaque ?? false);
  const [recursos, setRecursos] = useState((plano?.recursos ?? []).join("\n"));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function salvar() {
    setBusy(true); setErr("");
    const body = { id, nome, preco, telas_label: telas, destaque, recursos: recursos.split("\n").map(s => s.trim()).filter(Boolean), ordem: plano?.ordem ?? 0 };
    const r = editing
      ? await aapi(token, `/api/admin/planos/${plano!.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await aapi(token, "/api/admin/planos", { method: "POST", body: JSON.stringify(body) });
    const d = await r.json();
    setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal onClose={onClose} title={editing ? `Editar ${plano!.nome}` : "Novo plano"}>
      {!editing && <Field label="ID (slug)" value={id} onChange={setId} placeholder="ex: premium" />}
      <Field label="Nome" value={nome} onChange={setNome} />
      <Field label="Preço por tela (R$)" value={preco} onChange={setPreco} type="number" />
      <Field label="Descrição de telas" value={telas} onChange={setTelas} placeholder="ex: a partir de 3 telas" />
      <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={destaque} onChange={e => setDestaque(e.target.checked)} /> Plano em destaque</label>
      <label className="mb-1 block text-sm text-slate-300">Recursos (um por linha)</label>
      <textarea value={recursos} onChange={e => setRecursos(e.target.value)} rows={5} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
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
function GerarContratoModal({ token, conta, onClose }: { token: string; conta: Conta; onClose: () => void }) {
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
