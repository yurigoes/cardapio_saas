"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2, LogOut, LayoutDashboard, Users, Package, FileText, UserCog,
  Tv, Search, Plus, X, RefreshCw, MapPin, Megaphone, Upload, PlayCircle, StopCircle, BarChart3,
  LifeBuoy, Send, MonitorPlay, Trash2, Pencil, Wifi, WifiOff, Palette, Server, Camera, Power, Undo2, ScrollText, Map,
  Ticket, CalendarDays, Check, ChevronLeft, ChevronRight, History, Grid3x3, Database,
  FileSpreadsheet, Repeat, HandCoins, Archive,
} from "lucide-react";
import { NotifyHost, notify, confirmModal, promptModal } from "@/components/Notify";
import { aplicarCorBranding } from "@/components/Branding";
import { Notas, Cobrancas, Afiliados, Backups, Arquivados, DisplayProfiles, Calculadora, CalculadoraInline } from "./financeiro";
import { GruposDeLocais, NovoGrupoLocaisModal } from "./grupos-locais";
import { NotifBell } from "./notif-bell";
import { HealthcheckBar } from "./healthcheck-bar";
import { Tenants } from "./tenants";

const TOKEN_KEY = "midia_admin_token";
function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
}
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Aba = "dashboard" | "campanhas" | "anunciantes" | "locais" | "telas" | "pacotes" | "chamados" | "contratos" | "usuarios" | "marca" | "noxibo" | "mapa" | "auditoria" | "cupons" | "calendario" | "grade" | "templates" | "notas" | "cobrancas" | "afiliados" | "backups" | "arquivados" | "perfis" | "calculadora" | "tenants";

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
    { id: "telas",       label: "Telas",       icon: MonitorPlay, master: true },
    { id: "noxibo",      label: "No Xibo",     icon: Server, master: true },
    { id: "pacotes",     label: "Pacotes",     icon: Package, master: true },
    { id: "chamados",    label: "Chamados",    icon: LifeBuoy },
    { id: "contratos",   label: "Contratos",   icon: FileText, master: true },
    { id: "usuarios",    label: "Usuários",    icon: UserCog, master: true },
    { id: "marca",       label: "Marca",       icon: Palette, master: true },
    { id: "mapa",        label: "Mapa",        icon: Map },
    { id: "calendario",  label: "Calendário",  icon: CalendarDays },
    { id: "grade",       label: "Grade",       icon: Grid3x3 },
    { id: "calculadora", label: "Calculadora", icon: BarChart3 },
    { id: "templates",   label: "Templates",   icon: Database, master: true },
    { id: "cupons",      label: "Cupons",      icon: Ticket, master: true },
    { id: "notas",       label: "NFs",         icon: FileSpreadsheet, master: true },
    { id: "cobrancas",   label: "Cobranças",   icon: Repeat, master: true },
    { id: "afiliados",   label: "Afiliados",   icon: HandCoins, master: true },
    { id: "backups",     label: "Backups",     icon: Archive, master: true },
    { id: "perfis",      label: "Perfis player", icon: MonitorPlay, master: true },
    { id: "tenants",     label: "Tenants",     icon: Server, master: true },
    { id: "arquivados",  label: "Arquivados",  icon: Archive, master: true },
    { id: "auditoria",   label: "Auditoria",   icon: ScrollText, master: true },
  ];

  return (
    <main className="min-h-screen bg-[#0a0a12] text-white">
      <NotifyHost />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0a12]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2 text-brand-light">
            <Tv className="h-5 w-5" /><span className="font-bold">Admin · Three Digital Mídia</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a href="/guia" target="_blank" rel="noopener" className="flex items-center gap-1 text-slate-400 hover:text-white"><LifeBuoy className="h-4 w-4" /> Guia</a>
            <NotifBell token={token} />
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
        {aba === "telas"       && <Telas token={token} />}
        {aba === "pacotes"     && <Pacotes token={token} />}
        {aba === "chamados"    && <Chamados token={token} />}
        {aba === "contratos"   && <Contratos token={token} />}
        {aba === "usuarios"    && <Usuarios token={token} />}
        {aba === "marca"       && <Marca token={token} />}
        {aba === "mapa"        && <MapaLocais token={token} />}
        {aba === "calendario"  && <Calendario token={token} />}
        {aba === "grade"       && <GradeLocal token={token} />}
        {aba === "templates"   && <Templates token={token} />}
        {aba === "cupons"      && <Cupons token={token} />}
        {aba === "notas"       && <Notas token={token} />}
        {aba === "cobrancas"   && <Cobrancas token={token} />}
        {aba === "afiliados"   && <Afiliados token={token} />}
        {aba === "backups"     && <Backups token={token} />}
        {aba === "perfis"      && <DisplayProfiles token={token} />}
        {aba === "calculadora" && <Calculadora />}
        {aba === "tenants"     && <Tenants token={token} />}
        {aba === "arquivados"  && <Arquivados token={token} />}
        {aba === "auditoria"   && <Auditoria token={token} />}
        {aba === "noxibo"      && <NoXibo token={token} />}
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
  const [d, setD] = useState<{
    kpis: Record<string, number>;
    a_vencer: { nome: string; empresa: string; data_fim: string }[];
    ultimas: { empresa: string; nome: string; status: string; status_pagamento: string; valor: string; created_at: string }[];
  } | null>(null);
  useEffect(() => { aapi(token, "/api/admin/dashboard").then(r => r.json()).then(x => x.ok && setD(x)); }, [token]);
  if (!d) return <Loader2 className="h-6 w-6 animate-spin text-slate-500" />;
  return (
    <div>
      <HealthcheckBar token={token} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Kpi label="Anunciantes" value={String(d.kpis.anunciantes)} />
        <Kpi label="Campanhas no ar" value={String(d.kpis.campanhas_no_ar)} />
        <Kpi label="Receita recebida" value={brl(d.kpis.receita_paga)} />
        <Kpi label="A receber" value={brl(d.kpis.a_receber)} />
        <Kpi label="Locais ativos" value={String(d.kpis.locais)} />
      </div>

      {d.a_vencer.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-300">Campanhas a vencer (7 dias)</p>
          <div className="flex flex-wrap gap-2">
            {d.a_vencer.map((c, i) => <span key={i} className="rounded bg-white/5 px-2 py-1 text-xs">{c.empresa}: {c.nome} <span className="text-amber-300">→ {String(c.data_fim).slice(0, 10)}</span></span>)}
          </div>
        </div>
      )}

      <h2 className="mt-8 mb-3 text-lg font-bold">Últimas campanhas</h2>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Anunciante / Campanha</th><th className="p-3">Valor</th><th className="p-3">Status</th><th className="p-3">Pgto</th></tr></thead>
          <tbody>
            {d.ultimas.map((c, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="p-3"><div className="font-medium">{c.empresa}</div><div className="text-xs text-slate-400">{c.nome}</div></td>
                <td className="p-3">{brl(Number(c.valor))}</td>
                <td className="p-3"><Badge s={c.status} /></td>
                <td className="p-3"><span className={`text-xs ${c.status_pagamento === "pago" ? "text-emerald-300" : c.status_pagamento === "isento" ? "text-slate-400" : "text-amber-300"}`}>{c.status_pagamento}</span></td>
              </tr>
            ))}
            {!d.ultimas.length && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nenhuma campanha ainda.</td></tr>}
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
interface Local   { id: string; nome: string; cidade: string | null; endereco: string | null; largura: number; altura: number; xibo_display_group_id: number | null; ativo: boolean; conteudo_nome?: string | null; splash_nome?: string | null; lat?: number | null; lng?: number | null; passantes_dia?: number; telas_total?: number; telas_online?: number; sync_em?: string | null; tipo?: string; sincronia?: boolean; qtd_membros?: number | null; }
interface Pacote  { id: string; nome: string; tipo: string; dias: number; insercoes_dia: number; segundos: number; preco: number; ativo: boolean; ordem: number; }
interface Anunc   { id: string; nome: string; empresa: string; email: string; whatsapp: string | null; status: string; campanhas: number; }
interface Camp    { id: string; nome: string; tipo: string; dias: number; insercoes_dia: number; segundos: number; data_inicio: string | null; data_fim: string | null; valor: string; status: string; status_pagamento: string; xibo_campaign_id: number | null; arte_nome: string | null; empresa: string; anunciante: string; locais: number; arte_status?: string; arte_rejeicao_motivo?: string | null; hora_inicio?: string | null; hora_fim?: string | null; desconto?: string | null; dias_semana?: string | null; formato?: string; }
interface ArteVersao { id: string; arte_nome: string | null; arte_tipo: string | null; xibo_layout_id: number | null; ativa: boolean; criada_em: string; enviada_por: string | null; }
interface Cupom { id: string; codigo: string; tipo: string; valor: string; validade: string | null; max_usos: number | null; usos: number; ativo: boolean; created_at: string; }

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
  const [hi, setHi] = useState(""); const [hf, setHf] = useState("");
  const [cupom, setCupom] = useState("");
  const [diasSemana, setDiasSemana] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]); // ISO 1=Seg..7=Dom
  const [formato, setFormato] = useState<"simples" | "encarte_totem" | "encarte_gondola">("simples");
  const [insercoes, setInsercoes] = useState<string>(""); // override do pacote (se preenchido)
  const [segundos, setSegundos] = useState<string>("");   // override do pacote (se preenchido)
  const [verCalc, setVerCalc] = useState(false);
  const [selLocais, setSelLocais] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  function toggleDia(d: number) { setDiasSemana(s => s.includes(d) ? s.filter(x => x !== d) : [...s, d].sort((a, b) => a - b)); }

  useEffect(() => {
    aapi(token, "/api/admin/anunciantes").then(r => r.json()).then(d => d.ok && setAnuncs(d.anunciantes));
    aapi(token, "/api/admin/pacotes").then(r => r.json()).then(d => d.ok && setPacotes(d.pacotes.filter((p: Pacote) => p.ativo)));
    aapi(token, "/api/admin/locais/selecionaveis").then(r => r.json()).then(d => d.ok && setLocais(d.locais));
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
    const body = {
      conta_id: contaId, nome, pacote_id: pacoteId || undefined,
      data_inicio: inicio || undefined, data_fim: fim || undefined,
      hora_inicio: hi || undefined, hora_fim: hf || undefined,
      cupom_codigo: cupom.trim() || undefined,
      dias_semana: diasSemana.length === 7 ? undefined : diasSemana.join(","),
      formato,
      insercoes_dia: insercoes ? Number(insercoes) : undefined,
      segundos:      segundos  ? Number(segundos)  : undefined,
      valor: valor || 0, locais: selLocais,
    };
    const r = await aapi(token, "/api/admin/campanhas", { method: "POST", body: JSON.stringify(body) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }

  return (
    <Modal onClose={onClose} title="Nova campanha" wide>
      <label className="mb-1 block text-sm text-slate-300">Formato da campanha</label>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {([
          ["simples",          "Simples",     "1 arte fullscreen — campanhas normais"],
          ["encarte_totem",    "Totem entrada", "Vídeo/imagem vertical pra entrada de loja"],
          ["encarte_gondola",  "Ponta gôndola", "Várias artes em sequência (rotaciona todas, depois cede pra outros)"],
        ] as const).map(([k, lbl, desc]) => (
          <button type="button" key={k} onClick={() => setFormato(k)} className={`rounded-xl border px-3 py-2 text-left ${formato === k ? "border-brand bg-brand/15" : "border-white/10 hover:bg-white/5"}`}>
            <div className="text-sm font-medium">{lbl}</div>
            <div className="text-[10px] text-slate-400">{desc}</div>
          </button>
        ))}
      </div>
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
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Field label="Inserções/dia (opcional, sobrescreve pacote)" value={insercoes} onChange={setInsercoes} type="number" />
        <Field label="Segundos/inserção (opcional)" value={segundos} onChange={setSegundos} type="number" />
        <div className="flex items-end">
          <button type="button" onClick={() => setVerCalc(true)} className="w-full rounded-xl border border-brand/30 bg-brand/5 py-2 text-xs font-semibold text-brand-light hover:bg-brand/10">
            🧮 Calcular inserções
          </button>
        </div>
      </div>
      {verCalc && (
        <CalculadoraInline
          segundosInicial={segundos}
          onClose={() => setVerCalc(false)}
          onUsar={(ins, segs) => { setInsercoes(String(ins)); setSegundos(String(segs)); }}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Início" value={inicio} onChange={setInicio} type="date" />
        <Field label="Fim" value={fim} onChange={setFim} type="date" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Horário início (opcional, HH:MM)" value={hi} onChange={setHi} placeholder="ex: 08:00" />
        <Field label="Horário fim (opcional, HH:MM)" value={hf} onChange={setHf} placeholder="ex: 22:00" />
      </div>
      <label className="mb-1 block text-sm text-slate-300">Dias da semana</label>
      <div className="mb-3 flex flex-wrap gap-1">
        {[["Seg",1],["Ter",2],["Qua",3],["Qui",4],["Sex",5],["Sáb",6],["Dom",7]].map(([lbl, d]) => (
          <button key={d as number} type="button" onClick={() => toggleDia(d as number)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${diasSemana.includes(d as number) ? "border-brand bg-brand text-white" : "border-white/15 text-slate-400 hover:bg-white/5"}`}>
            {lbl}
          </button>
        ))}
        <button type="button" onClick={() => setDiasSemana([1,2,3,4,5,6,7])} className="ml-2 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-500 hover:bg-white/5">Todos</button>
      </div>
      <p className="mb-3 text-xs text-slate-500">Útil pra promoção semanal (ex: só Ter+Qua). Padrão: todos os dias.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" value={valor} onChange={setValor} type="number" />
        <Field label="Cupom (opcional)" value={cupom} onChange={v => setCupom(v.toUpperCase())} placeholder="ex: PROMO10" />
      </div>
      <label className="mb-1 block text-sm text-slate-300">Locais ({selLocais.length} selecionado{selLocais.length === 1 ? "" : "s"} de {locais.length})</label>
      <LocaisDropdown locais={locais} selecionados={selLocais} onToggle={toggleLocal} onTodos={() => setSelLocais(locais.map(l => l.id))} onNenhum={() => setSelLocais([])} />
      {selLocais.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {locais.filter(l => selLocais.includes(l.id)).map(l => (
            <span key={l.id} className="flex items-center gap-1 rounded-full bg-brand/20 px-2 py-0.5 text-xs text-brand-light">
              {l.nome}
              <button type="button" onClick={() => toggleLocal(l.id)} className="hover:text-white"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy || !contaId || !selLocais.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar campanha</button>
    </Modal>
  );
}

function CampanhaDetalhe({ token, camp, isMaster, onClose, onChange }: { token: string; camp: Camp; isMaster: boolean; onClose: () => void; onChange: () => void }) {
  const [det, setDet] = useState<{ campanha: Camp & { data_inicio: string | null; data_fim: string | null; valor: string; pacote_id?: string | null }; locais: Local[]; relatorio: { plays: number; duracao: number } | null } | null>(null);
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState("");
  const [editar, setEditar] = useState(false);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await aapi(token, `/api/admin/campanhas/${camp.id}`); const d = await r.json();
    if (d.ok) setDet(d);
  }, [token, camp.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (editar && !pacotes.length) aapi(token, "/api/admin/pacotes").then(r => r.json()).then(d => d.ok && setPacotes(d.pacotes.filter((p: Pacote) => p.ativo))); }, [editar, token, pacotes.length]);

  async function acao(path: string, label: string) {
    setBusy(label); setMsg("");
    const r = await aapi(token, `/api/admin/campanhas/${camp.id}/${path}`, { method: "POST" });
    const d = await r.json(); setBusy("");
    if (!d.ok) { notify(d.error || "Erro", "error"); return; }
    notify(label === "lancar" ? "Campanha no ar!" : label === "encerrar" ? "Campanha encerrada" : "Pronto", "success");
    load(); onChange();
  }
  async function enviarArte(file: File) {
    setBusy("arte"); setMsg("");
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch(`/api/admin/campanhas/${camp.id}/arte`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const d = await r.json(); setBusy("");
    if (!d.ok) { notify(d.error || "Erro no upload", "error"); return; }
    notify("Arte enviada", "success");
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

          {isMaster && (
            <div className="rounded-xl border border-white/10 p-3">
              <button onClick={() => setEditar(e => !e)} className="flex items-center gap-2 text-sm font-medium text-brand-light"><Pencil className="h-4 w-4" /> {editar ? "Fechar edição" : "Editar pacote / período / valor"}</button>
              {editar && <EditCampanha token={token} campId={camp.id} det={det.campanha} pacotes={pacotes} onSaved={() => { load(); onChange(); }} />}
            </div>
          )}

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

          {/* Playlist de encarte_gondola (várias artes em sequência) */}
          {(c as Camp & { formato?: string }).formato === "encarte_gondola" && isMaster && (
            <PlaylistEncarte token={token} campId={camp.id} onChange={() => { load(); onChange(); }} />
          )}

          {/* Aprovação de arte (workflow) */}
          {c.arte_status === "aguardando_aprovacao" && isMaster && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="font-medium text-amber-300">Arte enviada — aguardando sua aprovação</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    setBusy("aprovar");
                    const r = await aapi(token, `/api/admin/campanhas/${camp.id}/aprovar`, { method: "POST", body: JSON.stringify({ acao: "aprovar" }) });
                    const d = await r.json(); setBusy("");
                    notify(d.ok ? "Arte aprovada" : (d.error || "Erro"), d.ok ? "success" : "error");
                    load(); onChange();
                  }}
                  disabled={!!busy}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">
                  <Check className="h-4 w-4" /> Aprovar
                </button>
                <button
                  onClick={async () => {
                    const motivo = await promptModal("Motivo da rejeição", "Diga o que precisa ajustar");
                    if (!motivo) return;
                    setBusy("rejeitar");
                    const r = await aapi(token, `/api/admin/campanhas/${camp.id}/aprovar`, { method: "POST", body: JSON.stringify({ acao: "rejeitar", motivo }) });
                    const d = await r.json(); setBusy("");
                    notify(d.ok ? "Arte rejeitada" : (d.error || "Erro"), d.ok ? "success" : "error");
                    load(); onChange();
                  }}
                  disabled={!!busy}
                  className="flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                  <X className="h-4 w-4" /> Rejeitar
                </button>
              </div>
            </div>
          )}
          {c.arte_status === "rejeitada" && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm">
              <p className="font-medium text-red-300">Arte rejeitada</p>
              {c.arte_rejeicao_motivo && <p className="mt-1 text-slate-300">Motivo: {c.arte_rejeicao_motivo}</p>}
              <p className="mt-1 text-slate-400">Anunciante precisa enviar uma nova versão.</p>
            </div>
          )}

          {/* Histórico de criativos */}
          {isMaster && <HistoricoArtes token={token} campId={camp.id} onChange={() => { load(); onChange(); }} />}

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
              <button onClick={async () => {
                setBusy("dup");
                const r = await aapi(token, `/api/admin/campanhas/${camp.id}/duplicar`, { method: "POST" });
                const d = await r.json(); setBusy("");
                notify(d.ok ? "Campanha duplicada — abra a nova" : (d.error || "Erro"), d.ok ? "success" : "error");
                if (d.ok) { onChange(); onClose(); }
              }} disabled={!!busy} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50">
                {busy === "dup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Duplicar
              </button>
              {camp.status === "no_ar" && (
                <button onClick={async () => { setBusy("rel-email"); const r = await aapi(token, `/api/admin/campanhas/${camp.id}/relatorio-email`, { method: "POST" }); const d = await r.json(); setBusy(""); notify(d.ok ? "Relatório enviado por e-mail" : (d.error || "Erro"), d.ok ? "success" : "error"); }} disabled={!!busy} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50">
                  {busy === "rel-email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar relatório por e-mail
                </button>
              )}
              <button onClick={async () => {
                setBusy("pdf");
                try {
                  const r = await aapi(token, `/api/admin/campanhas/${camp.id}/relatorio-pdf`);
                  if (!r.ok) throw new Error("erro ao gerar");
                  const html = await r.text();
                  const blob = new Blob([html], { type: "text/html" });
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank");
                  setTimeout(() => URL.revokeObjectURL(url), 60_000);
                } catch (e) { notify((e as Error).message, "error"); }
                setBusy("");
              }} disabled={!!busy} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50">
                {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Gerar PDF
              </button>
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
function EditCampanha({ token, campId, det, pacotes, onSaved }: { token: string; campId: string; det: { data_inicio: string | null; data_fim: string | null; valor: string; insercoes_dia: number; segundos: number; dias: number; pacote_id?: string | null; hora_inicio?: string | null; hora_fim?: string | null; dias_semana?: string | null }; pacotes: Pacote[]; onSaved: () => void }) {
  const fmt = (d: string | null) => (d ? String(d).slice(0, 10) : "");
  const fmtH = (s: string | null | undefined) => (s ? String(s).slice(0, 5) : "");
  const [pacoteId, setPacoteId] = useState(det.pacote_id ?? "");
  const [ins, setIns] = useState(String(det.insercoes_dia));
  const [dias, setDias] = useState(String(det.dias));
  const [seg, setSeg] = useState(String(det.segundos));
  const [ini, setIni] = useState(fmt(det.data_inicio));
  const [fim, setFim] = useState(fmt(det.data_fim));
  const [hi, setHi] = useState(fmtH(det.hora_inicio));
  const [hf, setHf] = useState(fmtH(det.hora_fim));
  const [diasSemana, setDiasSemana] = useState<number[]>(det.dias_semana ? det.dias_semana.split(",").map(s => parseInt(s, 10)) : [1, 2, 3, 4, 5, 6, 7]);
  const [valor, setValor] = useState(String(Number(det.valor)));
  const [busy, setBusy] = useState(false);
  function toggleDia(d: number) { setDiasSemana(s => s.includes(d) ? s.filter(x => x !== d) : [...s, d].sort((a, b) => a - b)); }

  function aplicarPacote(id: string) {
    setPacoteId(id);
    const p = pacotes.find(x => x.id === id);
    if (p) { setIns(String(p.insercoes_dia)); setDias(String(p.dias)); setSeg(String(p.segundos)); }
  }
  async function salvar() {
    setBusy(true);
    const body = { pacote_id: pacoteId || undefined, insercoes_dia: ins, dias, segundos: seg, data_inicio: ini || undefined, data_fim: fim || undefined, hora_inicio: hi || undefined, hora_fim: hf || undefined, dias_semana: diasSemana.length === 7 ? "" : diasSemana.join(","), valor };
    const r = await aapi(token, `/api/admin/campanhas/${campId}`, { method: "PATCH", body: JSON.stringify(body) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { notify(d.error || "Erro", "error"); return; }
    notify("Campanha atualizada — clique em 'Reaplicar' pra atualizar no ar", "success");
    onSaved();
  }
  return (
    <div className="mt-3 space-y-3">
      <div>
        <label className="mb-1 block text-xs text-slate-400">Pacote (preenche os campos abaixo)</label>
        <select value={pacoteId} onChange={e => aplicarPacote(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none">
          <option value="">Personalizado</option>
          {pacotes.map(p => <option key={p.id} value={p.id}>{p.nome} · {p.insercoes_dia}/dia · {p.segundos}s</option>)}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Inserções/dia" value={ins} onChange={setIns} type="number" />
        <Field label="Dias" value={dias} onChange={setDias} type="number" />
        <Field label="Segundos" value={seg} onChange={setSeg} type="number" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Início" value={ini} onChange={setIni} type="date" />
        <Field label="Fim" value={fim} onChange={setFim} type="date" />
        <Field label="Valor (R$)" value={valor} onChange={setValor} type="number" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Horário início (HH:MM, opcional)" value={hi} onChange={setHi} placeholder="ex: 08:00" />
        <Field label="Horário fim (HH:MM, opcional)" value={hf} onChange={setHf} placeholder="ex: 22:00" />
      </div>
      <label className="mb-1 block text-xs text-slate-400">Dias da semana</label>
      <div className="mb-3 flex flex-wrap gap-1">
        {[["Seg",1],["Ter",2],["Qua",3],["Qui",4],["Sex",5],["Sáb",6],["Dom",7]].map(([lbl, d]) => (
          <button key={d as number} type="button" onClick={() => toggleDia(d as number)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${diasSemana.includes(d as number) ? "border-brand bg-brand text-white" : "border-white/15 text-slate-400 hover:bg-white/5"}`}>
            {lbl}
          </button>
        ))}
      </div>
      <button onClick={salvar} disabled={busy} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar alterações
      </button>
      <p className="text-xs text-slate-500">Depois de salvar, use <strong>Reaplicar</strong> (Lançar no ar) pra atualizar a campanha no Xibo com os novos números.</p>
    </div>
  );
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
  const [novoGrupo, setNovoGrupo] = useState(false);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/locais"); const d = await r.json(); if (d.ok) setLista(d.locais); }, [token]);
  useEffect(() => { load(); }, [load]);
  async function toggle(l: Local) { await aapi(token, "/api/admin/locais", { method: "PATCH", body: JSON.stringify({ id: l.id, ativo: !l.ativo }) }); load(); }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Locais (inventário)</h2>
        <div className="flex gap-2">
          <button onClick={() => setNovoGrupo(true)} className="flex items-center gap-2 rounded-xl border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/10"><Plus className="h-4 w-4" /> Novo grupo (ex: 8 gôndolas)</button>
          <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo local</button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {lista.map(l => <LocalCard key={l.id} token={token} local={l} onChange={load} onToggle={() => toggle(l)} />)}
        {!lista.length && <p className="text-sm text-slate-500">Nenhum local. Cadastre seus pontos de mídia.</p>}
      </div>

      <GruposDeLocais token={token} locaisDisponiveis={lista} />

      {novo && <LocalModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
      {novoGrupo && <NovoGrupoLocaisModal token={token} locais={lista} onClose={() => setNovoGrupo(false)} onSaved={() => { setNovoGrupo(false); load(); }} />}
    </div>
  );
}
function LocalCard({ token, local, onChange, onToggle }: { token: string; local: Local; onChange: () => void; onToggle: () => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [ocup, setOcup] = useState(false);
  const [busySplash, setBusySplash] = useState(false);
  const [ativar, setAtivar] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const splashRef = useRef<HTMLInputElement>(null);
  async function enviarConteudo(files: FileList) {
    setBusy(true); setErr("");
    const fd = new FormData(); Array.from(files).forEach(f => fd.append("file", f));
    const r = await fetch(`/api/admin/locais/${local.id}/conteudo`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const d = await r.json(); setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!d.ok) { notify(d.error || "erro", "error"); return; }
    notify(`Conteúdo base atualizado (${d.enviados ?? 1} arquivo${(d.enviados ?? 1) > 1 ? "s" : ""})`, "success");
    onChange();
  }
  async function enviarSplash(files: FileList) {
    setBusySplash(true);
    const fd = new FormData(); Array.from(files).forEach(f => fd.append("file", f));
    const r = await fetch(`/api/admin/locais/${local.id}/splash`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const d = await r.json(); setBusySplash(false);
    if (splashRef.current) splashRef.current.value = "";
    if (!d.ok) { notify(d.error || "erro", "error"); return; }
    notify(`Splash atualizado em ${d.telas_atualizadas ?? 0} tela(s)`, "success");
    onChange();
  }
  return (
    <div className={`rounded-2xl border p-4 ${local.ativo ? "border-white/10 bg-white/5" : "border-white/5 bg-white/[0.02] opacity-60"}`}>
      <div className="flex items-start justify-between">
        <div><p className="font-bold">{local.nome}</p><p className="text-xs text-slate-400">{local.cidade ?? ""}{local.endereco ? ` · ${local.endereco}` : ""}</p></div>
        <MapPin className="h-4 w-4 text-brand-light" />
      </div>
      <p className="mt-2 text-xs text-slate-500">{local.largura}×{local.altura} · grupo Xibo {local.xibo_display_group_id ?? "—"}</p>
      {(local.telas_total ?? 0) > 0 && (
        <p className="mt-1 text-xs">
          <span className={`inline-flex items-center gap-1 ${local.telas_online === local.telas_total ? "text-emerald-300" : local.telas_online! > 0 ? "text-amber-300" : "text-red-300"}`}>
            ● {local.telas_online}/{local.telas_total} tela(s) online
          </span>
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">Conteúdo base: {local.conteudo_nome ? <span className="text-emerald-300">{local.conteudo_nome}</span> : "nenhum"}</p>
      <p className="mt-1 text-xs text-slate-500">Splash (tela de espera): {local.splash_nome ? <span className="text-emerald-300">{local.splash_nome}</span> : "nenhum"}</p>
      {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
      <div className="mt-3 flex gap-2">
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-white/15 py-1.5 text-xs hover:bg-white/5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {local.conteudo_nome ? "Trocar conteúdo" : "Conteúdo base"}
          <input ref={inputRef} type="file" accept="image/*,video/*" multiple className="hidden" disabled={busy} onChange={e => { const f = e.target.files; if (f && f.length) enviarConteudo(f); }} />
        </label>
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-white/15 py-1.5 text-xs hover:bg-white/5">
          {busySplash ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {local.splash_nome ? "Trocar splash" : "Splash"}
          <input ref={splashRef} type="file" accept="image/*,video/*" multiple className="hidden" disabled={busySplash} onChange={e => { const f = e.target.files; if (f && f.length) enviarSplash(f); }} />
        </label>
        <button onClick={onToggle} className="flex-1 rounded-lg border border-white/15 py-1.5 text-xs hover:bg-white/5">{local.ativo ? "Desativar" : "Ativar"}</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={() => setOcup(true)} className="flex items-center justify-center gap-1 rounded-lg bg-brand/15 py-1.5 text-xs font-medium text-brand-light hover:bg-brand/25"><BarChart3 className="h-3.5 w-3.5" /> Ocupação</button>
        <button onClick={() => setAtivar(true)} className="flex items-center justify-center gap-1 rounded-lg border border-emerald-500/30 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10"><MonitorPlay className="h-3.5 w-3.5" /> Ativar TV por código</button>
      </div>
      {ocup && <OcupacaoModal token={token} local={local} onClose={() => setOcup(false)} />}
      {ativar && <AtivarPorCodigoModal token={token} local={local} onClose={() => setAtivar(false)} onSaved={() => { setAtivar(false); onChange(); }} />}
    </div>
  );
}

function AtivarPorCodigoModal({ token, local, onClose, onSaved }: { token: string; local: Local; onClose: () => void; onSaved: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState(`${local.nome} — Tela`);
  const [busy, setBusy] = useState(false); const [out, setOut] = useState<{ ok: boolean; msg?: string; error?: string } | null>(null);
  async function ativar() {
    setBusy(true); setOut(null);
    const r = await aapi(token, `/api/admin/locais/${local.id}/ativar-tela`, { method: "POST", body: JSON.stringify({ codigo: codigo.trim().toUpperCase(), nome }) });
    const d = await r.json(); setBusy(false); setOut(d);
    if (d.ok) {
      notify(d.msg || "Tela ativada", "success");
      setTimeout(() => onSaved(), 1500);
    } else notify(d.error || "Erro ao ativar", "error");
  }
  return (
    <Modal title={`Ativar TV em: ${local.nome}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-400">Quando você abre o app Xibo na TV pela primeira vez, ele mostra um <strong>código de 6 caracteres</strong>. Digite abaixo. <em>Pode levar até 1 minuto</em> — o app precisa buscar a configuração do CMS.</p>
      <Field label="Código da TV" value={codigo} onChange={v => setCodigo(v.toUpperCase())} placeholder="ex: A3F7K9" />
      <Field label="Nome desta TV (opcional)" value={nome} onChange={setNome} placeholder={`${local.nome} — Tela`} />
      {out && !out.ok && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-200">{out.error}</p>}
      {out?.ok && <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-200">✓ Ativada! O player deve atualizar em segundos.</p>}
      <button onClick={ativar} disabled={busy || codigo.trim().length < 4} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorPlay className="h-4 w-4" />} Ativar TV
      </button>
      <p className="mt-3 text-xs text-slate-500">Depois de ativada, ela será adicionada ao display group <code>{local.xibo_display_group_id ?? "(novo)"}</code> e começará a tocar o conteúdo base / campanhas deste local.</p>
    </Modal>
  );
}
interface OcupCamp { id: string; nome: string; status: string; status_pagamento: string; insercoes_dia: number; segundos: number; tipo: string; empresa: string; anunciante: string; }
function OcupacaoModal({ token, local, onClose }: { token: string; local: Local; onClose: () => void }) {
  const [d, setD] = useState<{ resumo: { anunciantes_no_ar: number; insercoes_dia: number; minutos_dia: number; capacidade_dia: number; ocupacao_pct: number | null }; campanhas: OcupCamp[] } | null>(null);
  useEffect(() => { aapi(token, `/api/admin/locais/${local.id}/ocupacao`).then(r => r.json()).then(x => x.ok && setD(x)); }, [token, local.id]);
  const pct = d?.resumo.ocupacao_pct ?? null;
  const cheio = pct != null && pct >= 100;
  return (
    <Modal title={`Ocupação — ${local.nome}`} onClose={onClose} wide>
      {!d ? <Loader2 className="h-6 w-6 animate-spin text-slate-500" /> : (
        <div>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Kpi label="Anunciantes no ar" value={String(d.resumo.anunciantes_no_ar)} />
            <Kpi label="Inserções/dia (total)" value={String(d.resumo.insercoes_dia)} />
            <Kpi label="Tempo de anúncio/dia" value={`${d.resumo.minutos_dia} min`} />
          </div>
          {d.resumo.capacidade_dia > 0 && (
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                <span>Ocupação da grade</span>
                <span className={cheio ? "text-red-300" : pct! >= 80 ? "text-amber-300" : "text-emerald-300"}>{d.resumo.insercoes_dia} / {d.resumo.capacidade_dia} inserções/dia ({pct}%)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full ${cheio ? "bg-red-500" : pct! >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(pct!, 100)}%` }} />
              </div>
              {cheio && <p className="mt-2 text-xs text-red-300">⚠ Grade no limite — evite vender mais inserções neste local sem aumentar a capacidade.</p>}
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Anunciante</th><th className="p-3">Inserções/dia</th><th className="p-3">Status</th><th className="p-3">Pgto</th></tr></thead>
              <tbody>
                {d.campanhas.map(c => (
                  <tr key={c.id} className="border-t border-white/5">
                    <td className="p-3"><div className="font-medium">{c.empresa}</div><div className="text-xs text-slate-500">{c.nome} · {TIPO_LABEL[c.tipo] ?? c.tipo}</div></td>
                    <td className="p-3">{c.insercoes_dia} <span className="text-xs text-slate-500">· {c.segundos}s</span></td>
                    <td className="p-3"><span className={`text-xs capitalize ${STATUS_CAMP[c.status] ?? ""}`}>{c.status.replace("_", " ")}</span></td>
                    <td className="p-3"><span className={`text-xs ${c.status_pagamento === "pago" ? "text-emerald-300" : c.status_pagamento === "isento" ? "text-slate-400" : "text-amber-300"}`}>{c.status_pagamento}</span></td>
                  </tr>
                ))}
                {!d.campanhas.length && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nenhuma campanha neste local.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">Soma das inserções/dia de todas as campanhas no ar neste ponto. Use pra dimensionar a grade e não saturar o loop.</p>
        </div>
      )}
    </Modal>
  );
}
function LocalModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(""); const [cidade, setCidade] = useState(""); const [endereco, setEndereco] = useState("");
  const [orientacao, setOrientacao] = useState<"retrato" | "paisagem">("retrato");
  const [capacidade, setCapacidade] = useState("0");
  const [lat, setLat] = useState(""); const [lng, setLng] = useState("");
  const [passantes, setPassantes] = useState("0");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  // largura/altura derivados da orientação (default; backend usa esses se não vierem)
  const largura = orientacao === "paisagem" ? "1920" : "1080";
  const altura  = orientacao === "paisagem" ? "1080" : "1920";
  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/locais", { method: "POST", body: JSON.stringify({ nome, cidade, endereco, orientacao, largura, altura, capacidade_dia: capacidade, lat: lat || null, lng: lng || null, passantes_dia: passantes }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal onClose={onClose} title="Novo local">
      <Field label="Nome do ponto" value={nome} onChange={setNome} placeholder="ex: Shopping Centro - Praça" />
      <div className="grid grid-cols-2 gap-3"><Field label="Cidade" value={cidade} onChange={setCidade} /><Field label="Endereço" value={endereco} onChange={setEndereco} /></div>
      <label className="mb-1 block text-sm text-slate-300">Orientação das telas</label>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(["retrato", "paisagem"] as const).map(o => (
          <button type="button" key={o} onClick={() => setOrientacao(o)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium ${orientacao === o ? "border-brand bg-brand/15 text-brand-light" : "border-white/10 text-slate-400 hover:bg-white/5"}`}>
            {o === "retrato" ? "Retrato (1080×1920)" : "Paisagem (1920×1080)"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Capacidade/dia (0 = ilimitado)" value={capacidade} onChange={setCapacidade} type="number" />
        <Field label="Passantes/dia (estimativa)" value={passantes} onChange={setPassantes} type="number" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" value={lat} onChange={setLat} placeholder="-12.971" />
        <Field label="Longitude" value={lng} onChange={setLng} placeholder="-38.513" />
      </div>
      <p className="mb-3 text-xs text-slate-500">Lat/lng aparecem no <strong>Mapa</strong>; passantes/dia entram no cálculo de audiência estimada da campanha. O sistema atribui o <strong>Display Profile</strong> certo ({orientacao}) automaticamente ao vincular telas.</p>
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

// ─── Telas (players Xibo) ───────────────────────────────────────────────────
interface DisplayItem { displayId: number; nome: string; autorizado: boolean; online: boolean; ultimoAcesso: string; clientType: string; hardwareKey?: string; local: { id: string; nome: string } | null; }
function Telas({ token }: { token: string }) {
  const [displays, setDisplays] = useState<DisplayItem[]>([]);
  const [locais, setLocais] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [sel, setSel] = useState<Record<number, string>>({});
  const [verTela, setVerTela] = useState<DisplayItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErro("");
    const r = await aapi(token, "/api/admin/displays"); const d = await r.json();
    if (d.ok) { setDisplays(d.displays); setLocais(d.locais); } else setErro(d.error || "erro");
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function acao(displayId: number, acao: string, extra: Record<string, unknown> = {}) {
    setBusy(displayId); setErro("");
    const r = await aapi(token, "/api/admin/displays", { method: "POST", body: JSON.stringify({ acao, displayId, ...extra }) });
    const d = await r.json(); setBusy(null);
    if (!d.ok) { notify(d.error || "Erro na operação", "error"); return; }
    // collect devolve msg detalhada + flag de confirmação
    if (acao === "collect") {
      notify(d.msg ?? "Comando enviado", d.confirmado ? "success" : "info");
    } else {
      notify("Tela atualizada com sucesso", "success");
    }
    load();
  }
  async function renomear(displayId: number, atual: string) {
    const nome = await promptModal("Novo nome da tela:", atual); if (!nome) return;
    acao(displayId, "renomear", { nome });
  }

  const pendentes = displays.filter(d => !d.autorizado);
  const ativos = displays.filter(d => d.autorizado);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Telas (players)</h2>
        <button onClick={load} className="rounded-xl border border-white/10 p-2 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <p className="mb-4 text-xs text-slate-500">Instale o app Xibo Player na TV apontando pra <strong>midia.tthreedigital.com.br</strong>. A tela aparece aqui como pendente — vincule a um local com 1 clique.</p>
      {erro && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{erro}</p>}
      {loading ? <Loader2 className="h-6 w-6 animate-spin text-slate-500" /> : (
        <>
          {pendentes.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-amber-300">Aguardando vínculo ({pendentes.length})</h3>
              <div className="space-y-2">
                {pendentes.map(d => (
                  <div key={d.displayId} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                    <div className="flex-1"><p className="font-medium">{d.nome}</p><p className="text-xs text-slate-400">{d.clientType} · visto {d.ultimoAcesso || "—"}{d.hardwareKey ? ` · cód: ${d.hardwareKey.slice(0, 10)}` : ""}</p></div>
                    <select value={sel[d.displayId] ?? ""} onChange={e => setSel(s => ({ ...s, [d.displayId]: e.target.value }))} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none">
                      <option value="">Escolher local…</option>
                      {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                    </select>
                    <button disabled={busy === d.displayId || !sel[d.displayId]} onClick={() => acao(d.displayId, "vincular", { local_id: sel[d.displayId] })}
                      className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50">
                      {busy === d.displayId ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Vincular
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 className="mb-2 text-sm font-semibold text-slate-300">Telas ativas ({ativos.length})</h3>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Tela</th><th className="p-3">Status</th><th className="p-3">Local</th><th className="p-3 text-right">Ações</th></tr></thead>
              <tbody>
                {ativos.map(d => (
                  <tr key={d.displayId} className="border-t border-white/5">
                    <td className="p-3 font-medium">{d.nome}</td>
                    <td className="p-3">{d.online ? <span className="flex items-center gap-1 text-emerald-300"><Wifi className="h-3.5 w-3.5" /> online</span> : <span className="flex items-center gap-1 text-slate-500"><WifiOff className="h-3.5 w-3.5" /> offline</span>}</td>
                    <td className="p-3">
                      <select value={d.local?.id ?? ""} onChange={e => { const lid = e.target.value; if (lid) acao(d.displayId, "vincular", { local_id: lid }); else if (d.local) acao(d.displayId, "desvincular", { local_id: d.local.id }); }}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none">
                        <option value="">— sem local —</option>
                        {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                      </select>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button onClick={() => setVerTela(d)} className="rounded border border-emerald-500/40 p-1.5 text-emerald-300 hover:bg-emerald-500/10" title="Ver tela agora (screenshot)"><Camera className="h-3.5 w-3.5" /></button>
                        <button onClick={() => acao(d.displayId, "collect")} disabled={busy === d.displayId} className="rounded border border-brand/40 p-1.5 text-brand-light hover:bg-brand/10 disabled:opacity-50" title="Forçar atualização agora">{busy === d.displayId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}</button>
                        <button onClick={() => acao(d.displayId, "revert")} className="rounded border border-white/15 p-1.5 hover:bg-white/5" title="Voltar pro schedule"><Undo2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => acao(d.displayId, "wol")} className="rounded border border-white/15 p-1.5 hover:bg-white/5" title="Wake-on-LAN"><Power className="h-3.5 w-3.5" /></button>
                        <button onClick={() => acao(d.displayId, "resync")} className="rounded border border-amber-500/40 p-1.5 text-amber-300 hover:bg-amber-500/10" title="Re-sync (destrava player zumbi)"><History className="h-3.5 w-3.5" /></button>
                        <button onClick={async () => { if (await confirmModal(`Limpar cache da tela "${d.nome}"?`)) acao(d.displayId, "clear-cache"); }} className="rounded border border-white/15 p-1.5 hover:bg-white/5" title="Limpar cache"><Database className="h-3.5 w-3.5" /></button>
                        <button onClick={() => renomear(d.displayId, d.nome)} className="rounded border border-white/15 p-1.5 hover:bg-white/5" title="Renomear"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={async () => { if (await confirmModal(`Excluir a tela "${d.nome}"?`)) acao(d.displayId, "excluir"); }} className="rounded border border-red-500/30 p-1.5 text-red-300 hover:bg-red-500/10" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!ativos.length && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nenhuma tela ativa ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {verTela && <ScreenshotModal token={token} display={verTela} onClose={() => setVerTela(null)} />}
    </div>
  );
}
function ScreenshotModal({ token, display, onClose }: { token: string; display: DisplayItem; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function pedirEAtualizar() {
    setBusy(true); setErr("");
    const r = await aapi(token, `/api/admin/displays/${display.displayId}/screenshot`, { method: "POST" });
    const d = await r.json();
    if (!d.ok) { setErr(d.error || "erro"); setBusy(false); return; }
    notify(d.msg || "Captura solicitada — aguarde 15–30s e atualize", "info");
    setTimeout(async () => { await carregar(); setBusy(false); }, 15_000);
  }
  async function carregar() {
    setErr("");
    if (url) URL.revokeObjectURL(url);
    const r = await aapi(token, `/api/admin/displays/${display.displayId}/screenshot`);
    if (!r.ok) { setErr("Sem captura ainda — peça uma nova."); setUrl(null); return; }
    const b = await r.blob(); setUrl(URL.createObjectURL(b));
  }
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title={`Tela: ${display.nome}`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex gap-2">
          <button onClick={pedirEAtualizar} disabled={busy} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Capturar agora</button>
          <button onClick={carregar} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
        </div>
        {err && <p className="text-sm text-amber-300">{err}</p>}
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="screenshot" className="max-h-[70vh] w-full rounded-lg border border-white/10 bg-black object-contain" />
        ) : !err && <Loader2 className="h-6 w-6 animate-spin text-slate-500" />}
      </div>
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

// ─── Marca (branding) ───────────────────────────────────────────────────────
interface BrandingData { nome: string; logo_url: string | null; cor: string; cor_dark: string; cor_light: string; site: string | null; email: string | null; whatsapp: string | null; cnpj: string | null; razao_social: string | null; player_apk_url: string | null; player_versao: string | null; }
function Marca({ token }: { token: string }) {
  const [b, setB] = useState<BrandingData | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { aapi(token, "/api/admin/branding").then(r => r.json()).then(d => d.ok && setB(d.branding)); }, [token]);
  function set<K extends keyof BrandingData>(k: K, v: BrandingData[K]) { setB(p => p ? { ...p, [k]: v } : p); }
  // preview de cor ao vivo
  useEffect(() => { if (b) aplicarCorBranding(b.cor, b.cor_dark, b.cor_light); }, [b?.cor, b?.cor_dark, b?.cor_light]);

  async function salvar() {
    if (!b) return;
    setBusy(true);
    const r = await aapi(token, "/api/admin/branding", { method: "PUT", body: JSON.stringify(b) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { notify(d.error || "Erro", "error"); return; }
    notify("Marca atualizada — aplicada em todo o sistema", "success");
    aplicarCorBranding(d.branding.cor, d.branding.cor_dark, d.branding.cor_light);
  }
  if (!b) return <Loader2 className="h-6 w-6 animate-spin text-slate-500" />;
  return (
    <div className="max-w-2xl">
      <h2 className="mb-1 text-lg font-bold">Marca do sistema</h2>
      <p className="mb-5 text-sm text-slate-400">O que você alterar aqui vale pra landing, painel admin, portal do cliente, e-mails e contratos.</p>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
        <Field label="Nome do sistema" value={b.nome} onChange={v => set("nome", v)} />
        <Field label="URL da logo (PNG transparente)" value={b.logo_url ?? ""} onChange={v => set("logo_url", v)} placeholder="https://..." />
        {b.logo_url && (
          <div className="rounded-xl p-3" style={{ background: b.cor }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.logo_url} alt="logo" className="mx-auto h-12 object-contain" />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm text-slate-300">Cores</label>
          <div className="flex flex-wrap gap-4">
            <CorField label="Principal" value={b.cor} onChange={v => set("cor", v)} />
            <CorField label="Escura (hover)" value={b.cor_dark} onChange={v => set("cor_dark", v)} />
            <CorField label="Clara (destaques)" value={b.cor_light} onChange={v => set("cor_light", v)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Razão social" value={b.razao_social ?? ""} onChange={v => set("razao_social", v)} />
          <Field label="CNPJ" value={b.cnpj ?? ""} onChange={v => set("cnpj", v)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Site" value={b.site ?? ""} onChange={v => set("site", v)} />
          <Field label="E-mail" value={b.email ?? ""} onChange={v => set("email", v)} />
          <Field label="WhatsApp" value={b.whatsapp ?? ""} onChange={v => set("whatsapp", v)} />
        </div>
        <div className="border-t border-white/10 pt-4">
          <p className="mb-1 text-sm font-semibold text-slate-300">Player Android (APK)</p>
          <p className="mb-3 text-xs text-slate-500">Hospede o APK do Xibo Player (recomendado: no MinIO) e cole a URL. Vai aparecer um botão de download no /guia e no rodapé da landing.</p>
          <div className="grid grid-cols-[1fr_180px] gap-3">
            <Field label="URL do APK" value={b.player_apk_url ?? ""} onChange={v => set("player_apk_url", v)} placeholder="https://minio.tthreedigital.com.br/.../xibo-player.apk" />
            <Field label="Versão (rótulo)" value={b.player_versao ?? ""} onChange={v => set("player_versao", v)} placeholder="ex: R301 (v3)" />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={salvar} disabled={busy} className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar
          </button>
          <span className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">amostra da cor</span>
        </div>
      </div>
    </div>
  );
}
function CorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
        <input value={value} onChange={e => onChange(e.target.value)} className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-xs outline-none focus:border-brand/50" />
      </div>
    </div>
  );
}

// ─── No Xibo (o que está realmente carregado) ───────────────────────────────
interface XiboCamp { campaignId: number; nome: string; layouts: number[]; sistema: { empresa: string; campanha: string; status: string } | null; orfa: boolean; }
function NoXibo({ token }: { token: string }) {
  const [lista, setLista] = useState<XiboCamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const r = await aapi(token, "/api/admin/xibo-conteudo"); const d = await r.json();
    if (d.ok) setLista(d.campanhas); else notify(d.error || "erro", "error");
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function excluir(c: XiboCamp) {
    if (!await confirmModal(`Excluir do Xibo "${c.nome}"? Isso remove a campanha e o conteúdo da(s) tela(s).`)) return;
    setBusy(c.campaignId);
    const r = await aapi(token, "/api/admin/xibo-conteudo", { method: "POST", body: JSON.stringify({ campaignId: c.campaignId, layouts: c.layouts }) });
    const d = await r.json(); setBusy(null);
    if (!d.ok) { notify(d.error || "erro", "error"); return; }
    notify("Removido do Xibo", "success"); load();
  }

  const orfas = lista.filter(c => c.orfa);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold">Conteúdo no Xibo</h2>
        <button onClick={load} className="rounded-xl border border-white/10 p-2 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <p className="mb-4 text-xs text-slate-500">Campanhas (anúncios) que estão de fato carregadas no Xibo. As marcadas como <span className="text-amber-300">órfãs</span> não existem mais no sistema — pode excluir pra parar de tocar.</p>
      {orfas.length > 0 && <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">{orfas.length} campanha(s) órfã(s) ainda no Xibo — limpe pra não tocar conteúdo antigo.</div>}
      {loading ? <Loader2 className="h-6 w-6 animate-spin text-slate-500" /> : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Campanha (Xibo)</th><th className="p-3">Anunciante / Sistema</th><th className="p-3">Origem</th><th className="p-3 text-right">Ação</th></tr></thead>
            <tbody>
              {lista.map(c => (
                <tr key={c.campaignId} className="border-t border-white/5">
                  <td className="p-3 font-medium">{c.nome}<div className="text-xs text-slate-500">#{c.campaignId} · {c.layouts.length} layout(s)</div></td>
                  <td className="p-3">{c.sistema ? <><div className="font-medium">{c.sistema.empresa}</div><div className="text-xs text-slate-500">{c.sistema.campanha} · {c.sistema.status}</div></> : <span className="text-slate-500">—</span>}</td>
                  <td className="p-3">{c.orfa ? <span className="text-xs text-amber-300">órfã</span> : <span className="text-xs text-emerald-300">do sistema</span>}</td>
                  <td className="p-3 text-right"><button onClick={() => excluir(c)} disabled={busy === c.campaignId} className="flex items-center gap-1 rounded border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50">{busy === c.campaignId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Excluir</button></td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nenhuma campanha de anúncio no Xibo.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Mapa de locais ─────────────────────────────────────────────────────────
function MapaLocais({ token }: { token: string }) {
  const [locais, setLocais] = useState<Local[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { aapi(token, "/api/admin/locais").then(r => r.json()).then(d => d.ok && setLocais(d.locais)); }, [token]);
  useEffect(() => {
    if (!ref.current || !locais.length) return;
    // Carrega Leaflet via CDN (uma vez)
    const ensure = async () => {
      if (!(window as unknown as { L?: unknown }).L) {
        await new Promise<void>((res) => { const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(link); const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload = () => res(); document.body.appendChild(s); });
      }
      // @ts-expect-error Leaflet via CDN sem types
      const L = window.L;
      if (!ref.current) return;
      ref.current.innerHTML = "";
      const ptos = locais.filter(l => l.lat != null && l.lng != null) as (Local & { lat: number; lng: number })[];
      const center = ptos.length ? [Number(ptos[0].lat), Number(ptos[0].lng)] : [-12.97, -38.51];
      const map = L.map(ref.current).setView(center, ptos.length > 1 ? 6 : 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);
      ptos.forEach(l => {
        const cor = l.ativo ? "#22c55e" : "#94a3b8";
        const icon = L.divIcon({ html: `<div style="background:${cor};width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px #0008;"></div>`, className: "", iconSize: [18, 18] });
        L.marker([Number(l.lat), Number(l.lng)], { icon }).addTo(map).bindPopup(`<b>${l.nome}</b><br>${l.cidade ?? ""}${l.passantes_dia ? `<br>${l.passantes_dia} passantes/dia` : ""}`);
      });
    };
    ensure();
  }, [locais]);
  const semGeo = locais.filter(l => l.lat == null || l.lng == null).length;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Mapa de locais</h2><span className="text-xs text-slate-500">{locais.length} locais · {semGeo} sem coordenadas</span></div>
      <div ref={ref} className="h-[70vh] w-full rounded-xl border border-white/10 bg-slate-900" />
      {semGeo > 0 && <p className="mt-2 text-xs text-amber-300">⚠ {semGeo} locais sem lat/lng — edite os locais e preencha pra aparecerem no mapa.</p>}
    </div>
  );
}

// ─── Auditoria ──────────────────────────────────────────────────────────────
interface AuditEvento { id: string; autor_tipo: string; autor_nome: string | null; acao: string; entidade: string | null; entidade_id: string | null; detalhes: Record<string, unknown> | null; ip: string | null; created_at: string; }
function Auditoria({ token }: { token: string }) {
  const [evs, setEvs] = useState<AuditEvento[]>([]);
  const [q, setQ] = useState("");
  const load = useCallback(async () => { const r = await aapi(token, `/api/admin/auditoria?q=${encodeURIComponent(q)}`); const d = await r.json(); if (d.ok) setEvs(d.eventos); }, [token, q]);
  useEffect(() => { load(); }, [load]);
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3"><Search className="h-4 w-4 text-slate-500" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar por ação, autor ou entidade" className="w-full bg-transparent py-2 text-sm outline-none" /></div>
        <button onClick={load} className="rounded-xl border border-white/10 p-2 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Quando</th><th className="p-3">Quem</th><th className="p-3">Ação</th><th className="p-3">Entidade</th><th className="p-3">Detalhes</th></tr></thead>
          <tbody>
            {evs.map(e => (
              <tr key={e.id} className="border-t border-white/5 align-top">
                <td className="p-3 whitespace-nowrap text-xs text-slate-400">{new Date(e.created_at.replace(" ", "T")).toLocaleString("pt-BR")}</td>
                <td className="p-3 text-xs"><div>{e.autor_nome ?? "—"}</div><div className="text-slate-500">{e.autor_tipo}</div></td>
                <td className="p-3 font-mono text-xs">{e.acao}</td>
                <td className="p-3 text-xs">{e.entidade}{e.entidade_id ? <div className="text-slate-500">{String(e.entidade_id).slice(0,12)}</div> : null}</td>
                <td className="p-3 text-xs text-slate-400">{e.detalhes ? <pre className="whitespace-pre-wrap">{JSON.stringify(e.detalhes,null,0).slice(0,200)}</pre> : ""}</td>
              </tr>
            ))}
            {!evs.length && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Sem eventos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Histórico de criativos (dentro do CampanhaDetalhe) ─────────────────────
function HistoricoArtes({ token, campId, onChange }: { token: string; campId: string; onChange: () => void }) {
  const [versoes, setVersoes] = useState<ArteVersao[]>([]);
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const r = await aapi(token, `/api/admin/campanhas/${campId}/artes`); const d = await r.json();
    if (d.ok) setVersoes(d.artes);
  }, [token, campId]);
  useEffect(() => { load(); }, [load]);

  async function reativar(arteId: string) {
    if (!await confirmModal("Reativar esta versão? A versão atual passa a ser inativa.")) return;
    setBusy(arteId);
    const r = await aapi(token, `/api/admin/campanhas/${campId}/artes`, { method: "POST", body: JSON.stringify({ arte_id: arteId }) });
    const d = await r.json(); setBusy("");
    notify(d.ok ? "Versão reativada — Reaplicar p/ ir ao ar" : (d.error || "Erro"), d.ok ? "success" : "error");
    if (d.ok) { load(); onChange(); }
  }
  if (!versoes.length) return null;
  return (
    <div className="rounded-xl border border-white/10 p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300"><History className="h-4 w-4" /> Versões da arte ({versoes.length})</p>
      <ul className="space-y-1.5 text-xs">
        {versoes.map(v => (
          <li key={v.id} className="flex items-center justify-between rounded bg-white/5 px-2 py-1.5">
            <div>
              <span className={v.ativa ? "font-semibold text-emerald-300" : "text-slate-300"}>{v.arte_nome ?? "—"}</span>
              <span className="ml-2 text-slate-500">{new Date(v.criada_em).toLocaleString("pt-BR")}</span>
              {v.enviada_por && <span className="ml-2 text-slate-500">· {v.enviada_por}</span>}
              {v.ativa && <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">ATIVA</span>}
            </div>
            {!v.ativa && (
              <button onClick={() => reativar(v.id)} disabled={busy === v.id} className="rounded border border-white/15 px-2 py-1 hover:bg-white/5 disabled:opacity-50">
                {busy === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Reativar"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Cupons ─────────────────────────────────────────────────────────────────
function Cupons({ token }: { token: string }) {
  const [lista, setLista] = useState<Cupom[]>([]);
  const [novo, setNovo] = useState(false);
  const load = useCallback(async () => {
    const r = await aapi(token, "/api/admin/cupons"); const d = await r.json();
    if (d.ok) setLista(d.cupons);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function toggleAtivo(c: Cupom) {
    await aapi(token, "/api/admin/cupons", { method: "PATCH", body: JSON.stringify({ id: c.id, ativo: !c.ativo }) });
    load();
  }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cupons de desconto</h2>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo cupom</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Código</th><th className="p-3">Tipo</th><th className="p-3">Valor</th><th className="p-3">Validade</th><th className="p-3">Usos</th><th className="p-3">Ativo</th></tr></thead>
          <tbody>
            {lista.map(c => (
              <tr key={c.id} className="border-t border-white/5">
                <td className="p-3 font-mono">{c.codigo}</td>
                <td className="p-3">{c.tipo === "pct" ? "Percentual" : "Fixo"}</td>
                <td className="p-3">{c.tipo === "pct" ? `${Number(c.valor)}%` : brl(Number(c.valor))}</td>
                <td className="p-3 text-xs">{c.validade ? new Date(c.validade).toLocaleDateString("pt-BR") : "—"}</td>
                <td className="p-3 text-xs">{c.usos}{c.max_usos != null ? ` / ${c.max_usos}` : ""}</td>
                <td className="p-3"><button onClick={() => toggleAtivo(c)} className={`rounded px-2 py-1 text-xs ${c.ativo ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-slate-400"}`}>{c.ativo ? "Sim" : "Não"}</button></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Nenhum cupom.</td></tr>}
          </tbody>
        </table>
      </div>
      {novo && <NovoCupomModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
    </div>
  );
}
function NovoCupomModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [codigo, setCodigo] = useState(""); const [tipo, setTipo] = useState("pct");
  const [valor, setValor] = useState(""); const [validade, setValidade] = useState("");
  const [maxUsos, setMaxUsos] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function salvar() {
    setBusy(true); setErr("");
    const body = { codigo: codigo.trim().toUpperCase(), tipo, valor: Number(valor), validade: validade || null, max_usos: maxUsos ? Number(maxUsos) : null };
    const r = await aapi(token, "/api/admin/cupons", { method: "POST", body: JSON.stringify(body) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal onClose={onClose} title="Novo cupom">
      <Field label="Código" value={codigo} onChange={v => setCodigo(v.toUpperCase())} placeholder="ex: PROMO10" />
      <label className="mb-1 block text-sm text-slate-300">Tipo</label>
      <select value={tipo} onChange={e => setTipo(e.target.value)} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
        <option value="pct">Percentual (%)</option>
        <option value="fixo">Valor fixo (R$)</option>
      </select>
      <Field label={tipo === "pct" ? "Desconto (%)" : "Desconto (R$)"} value={valor} onChange={setValor} type="number" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Validade (opcional)" value={validade} onChange={setValidade} type="date" />
        <Field label="Máx. usos (opcional)" value={maxUsos} onChange={setMaxUsos} type="number" />
      </div>
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={salvar} disabled={busy || !codigo || !valor} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar cupom</button>
    </Modal>
  );
}

// ─── Calendário de campanhas ────────────────────────────────────────────────
function Calendario({ token }: { token: string }) {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth()); // 0-11
  const [camps, setCamps] = useState<Camp[]>([]);
  const load = useCallback(async () => {
    const r = await aapi(token, "/api/admin/campanhas"); const d = await r.json();
    if (d.ok) setCamps(d.campanhas);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  function navega(delta: number) {
    let m = mes + delta, a = ano;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    setMes(m); setAno(a);
  }

  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia   = new Date(ano, mes + 1, 0);
  const inicioGrade = new Date(primeiroDia); inicioGrade.setDate(1 - primeiroDia.getDay());
  const dias: Date[] = [];
  for (let i = 0; i < 42; i++) { const d = new Date(inicioGrade); d.setDate(inicioGrade.getDate() + i); dias.push(d); }

  function campsNoDia(d: Date): Camp[] {
    const t = d.getTime();
    return camps.filter(c => {
      if (!c.data_inicio || !c.data_fim) return false;
      const a = new Date(c.data_inicio).getTime();
      const b = new Date(c.data_fim).getTime();
      return t >= a && t <= b;
    });
  }
  const nomesMes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Calendário</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => navega(-1)} className="rounded-lg border border-white/15 p-2 hover:bg-white/5"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[180px] text-center font-medium">{nomesMes[mes]} {ano}</span>
          <button onClick={() => navega(1)} className="rounded-lg border border-white/15 p-2 hover:bg-white/5"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d => <div key={d} className="p-2 text-center font-medium text-slate-400">{d}</div>)}
        {dias.map((d, i) => {
          const noMes = d.getMonth() === mes;
          const lista = campsNoDia(d);
          const ehDeFora = d < primeiroDia || d > ultimoDia;
          return (
            <div key={i} className={`min-h-[80px] rounded border p-1 ${noMes ? "border-white/10 bg-white/5" : "border-white/5 bg-white/0 opacity-40"} ${ehDeFora ? "" : ""}`}>
              <div className="text-slate-500">{d.getDate()}</div>
              <div className="mt-1 space-y-0.5">
                {lista.slice(0, 3).map(c => (
                  <div key={c.id} className="truncate rounded bg-brand/30 px-1 text-[10px]" title={`${c.empresa} — ${c.nome}`}>{c.nome}</div>
                ))}
                {lista.length > 3 && <div className="text-[10px] text-slate-500">+{lista.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── UI helpers ──────────────────────────────────────────────────────────────
function Modal({ children, title, onClose, wide }: { children: React.ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  return (
    <div className="overlay-in fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className={`drawer-in absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto border-l border-white/10 bg-[#12121c] p-6 shadow-2xl sm:w-[70%] ${wide ? "max-w-4xl" : "max-w-xl"}`}>
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

// ─── Pré-visualização da grade (linha do tempo por local) ───────────────────
interface GradeCamp { id: string; nome: string; tipo: string; insercoes_dia: number; segundos: number; hora_inicio: string | null; hora_fim: string | null; data_inicio: string; data_fim: string; status: string; arte_status: string | null; empresa: string; }
function GradeLocal({ token }: { token: string }) {
  const [locais, setLocais] = useState<Local[]>([]);
  const [localId, setLocalId] = useState("");
  const [dia, setDia] = useState(new Date().toISOString().slice(0, 10));
  const [dados, setDados] = useState<{ local: Local; campanhas: GradeCamp[]; totalInsercoes: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    aapi(token, "/api/admin/locais").then(r => r.json()).then(d => {
      if (d.ok) { setLocais(d.locais); if (!localId && d.locais[0]) setLocalId(d.locais[0].id); }
    });
  }, [token, localId]);

  useEffect(() => {
    if (!localId) return;
    setLoading(true);
    aapi(token, `/api/admin/locais/${localId}/grade?dia=${dia}`).then(r => r.json()).then(d => {
      if (d.ok) setDados(d); setLoading(false);
    });
  }, [token, localId, dia]);

  // Cor consistente por anunciante
  const cor = (s: string) => {
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
    return `hsl(${h % 360}, 70%, 45%)`;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">Grade do local</h2>
        <select value={localId} onChange={e => setLocalId(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
          {locais.map(l => <option key={l.id} value={l.id}>{l.nome}{l.cidade ? ` · ${l.cidade}` : ""}</option>)}
        </select>
        <input type="date" value={dia} onChange={e => setDia(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
      </div>
      {loading || !dados ? <Loader2 className="h-6 w-6 animate-spin text-slate-500" /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Info label="Local" v={dados.local.nome} />
            <Info label="Resolução" v={`${dados.local.largura}×${dados.local.altura}`} />
            <Info label="Campanhas no dia" v={String(dados.campanhas.length)} />
            <Info label="Inserções/dia" v={String(dados.totalInsercoes)} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="mb-2 grid gap-px text-[10px] text-slate-500" style={{ gridTemplateColumns: "repeat(24, minmax(0,1fr))" }}>
              {Array.from({ length: 24 }, (_, i) => <div key={i} className="text-center">{String(i).padStart(2, "0")}</div>)}
            </div>
            <div className="space-y-1.5">
              {dados.campanhas.map(c => {
                const h1 = c.hora_inicio ? parseInt(c.hora_inicio.slice(0, 2), 10) + parseInt(c.hora_inicio.slice(3, 5), 10) / 60 : 0;
                const h2 = c.hora_fim    ? parseInt(c.hora_fim.slice(0, 2), 10) + parseInt(c.hora_fim.slice(3, 5), 10) / 60 : 24;
                const left = (h1 / 24) * 100;
                const width = Math.max(((h2 - h1) / 24) * 100, 2);
                return (
                  <div key={c.id} className="relative h-7 rounded bg-white/5">
                    <div
                      className="absolute top-0 h-full rounded px-2 text-[11px] font-medium leading-7 text-white overflow-hidden whitespace-nowrap"
                      style={{ left: `${left}%`, width: `${width}%`, background: cor(c.empresa) }}
                      title={`${c.empresa} — ${c.nome} (${c.insercoes_dia}/dia × ${c.segundos}s)`}
                    >
                      {c.empresa} · {c.nome} · {c.insercoes_dia}/dia
                    </div>
                  </div>
                );
              })}
              {!dados.campanhas.length && <p className="py-6 text-center text-sm text-slate-500">Nenhuma campanha ativa neste local em {dia}.</p>}
            </div>
            <p className="mt-3 text-[10px] text-slate-600">Barras mostram a janela de horário (day-parting). Sem horário = dia todo. Não considera o intervalo entre exibições — só a janela.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Templates multi-zona ────────────────────────────────────────────────────
function Templates({ token }: { token: string }) {
  const [template, setTemplate] = useState("video_ticker");
  const [nome, setNome] = useState("");
  const [w, setW] = useState("1080"); const [h, setH] = useState("1920");
  const [rss, setRss] = useState("https://g1.globo.com/rss/g1/");
  const [lat, setLat] = useState(""); const [lng, setLng] = useState("");
  const [busy, setBusy] = useState(false); const [out, setOut] = useState<{ ok: boolean; layoutId?: number; error?: string } | null>(null);

  async function gerar() {
    setBusy(true); setOut(null);
    const body: Record<string, unknown> = { template, nome, width: Number(w), height: Number(h) };
    if (template !== "imagem_clima_relogio") body.rss_url = rss;
    if (lat) body.latitude = Number(lat); if (lng) body.longitude = Number(lng);
    const r = await aapi(token, "/api/admin/templates", { method: "POST", body: JSON.stringify(body) });
    const d = await r.json(); setBusy(false); setOut(d);
    if (d.ok) notify(`Template criado — layout #${d.layoutId}. Agende em Locais > Default Layout ou crie uma campanha que use-o.`, "success");
    else notify(d.error || "Erro", "error");
  }

  const descs: Record<string, string> = {
    video_ticker: "Vídeo no topo (88% da tela) + ticker RSS rodando no rodapé (12%).",
    imagem_clima_relogio: "Imagem (80%) + previsão do tempo (40%) + relógio (40%) embaixo.",
    rss_clima: "Notícias (70%) + previsão do tempo (30%) — sem imagem do anunciante.",
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Templates multi-zona</h2>
      <p className="mb-4 text-sm text-slate-400">Cria um layout no Xibo com várias regiões (vídeo/imagem + ticker RSS + clima + relógio). Depois é só usar como layout padrão num local ou como base de uma campanha.</p>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
        <label className="block text-sm text-slate-300">Template</label>
        <select value={template} onChange={e => setTemplate(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
          <option value="video_ticker">Vídeo + Ticker RSS</option>
          <option value="imagem_clima_relogio">Imagem + Clima + Relógio</option>
          <option value="rss_clima">RSS + Clima (sem mídia)</option>
        </select>
        <p className="text-xs text-slate-500">{descs[template]}</p>

        <Field label="Nome do layout" value={nome} onChange={setNome} placeholder="ex: Template padrão lojas SP" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Largura" value={w} onChange={setW} type="number" />
          <Field label="Altura" value={h} onChange={setH} type="number" />
        </div>
        {template !== "imagem_clima_relogio" && <Field label="URL do RSS" value={rss} onChange={setRss} placeholder="https://..." />}
        {(template === "imagem_clima_relogio" || template === "rss_clima") && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude (clima)" value={lat} onChange={setLat} placeholder="-23.55" />
            <Field label="Longitude (clima)" value={lng} onChange={setLng} placeholder="-46.63" />
          </div>
        )}

        <button onClick={gerar} disabled={busy || !nome} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar template no Xibo
        </button>

        {out && (
          <div className={`mt-3 rounded-lg border p-3 text-sm ${out.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200" : "border-red-500/30 bg-red-500/5 text-red-200"}`}>
            {out.ok ? `Layout #${out.layoutId} criado. Vá em Locais e defina como "Layout padrão" do local desejado, ou crie uma campanha que o utilize.` : out.error}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm">
        <p className="mb-2 font-medium text-slate-200">💡 Como usar:</p>
        <ol className="ml-4 list-decimal space-y-1 text-slate-400">
          <li>Crie o template aqui — ele vira um <strong>Layout</strong> no Xibo.</li>
          <li>Para usar como <em>splash</em>/padrão num local, vá em <strong>Locais → Editar → Default Layout</strong>.</li>
          <li>Para usar como criativo de uma campanha, abra a campanha no Xibo e ajuste a região da mídia.</li>
          <li>Quer um ticker RSS pessoal? Hospede um feed XML no <code>/landing/public</code> ou use feeds públicos (g1, lance, valor).</li>
        </ol>
      </div>
    </div>
  );
}

// ─── Playlist do encarte_gondola ────────────────────────────────────────────
interface ItemPlaylist { id: string; arte_nome: string | null; arte_tipo: string | null; xibo_layout_id: number | null; criada_em: string; }
function PlaylistEncarte({ token, campId, onChange }: { token: string; campId: string; onChange: () => void }) {
  const [itens, setItens] = useState<ItemPlaylist[]>([]);
  const [busy, setBusy] = useState(false);
  const [progresso, setProgresso] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await aapi(token, `/api/admin/campanhas/${campId}/playlist`); const d = await r.json();
    if (d.ok) setItens(d.itens);
  }, [token, campId]);
  useEffect(() => { load(); }, [load]);

  async function enviarArquivos(files: FileList) {
    setBusy(true); setProgresso("");
    try {
      // Separa PDFs (converte) e demais (envia direto)
      const pdfs = Array.from(files).filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
      const outros = Array.from(files).filter(f => !pdfs.includes(f));

      const enviar: File[] = [...outros];

      // Converte cada PDF em imagens (1 por página) — client-side via pdfjs-dist (CDN)
      if (pdfs.length) {
        setProgresso("Carregando conversor de PDF…");
        await carregarPdfJs();
        // @ts-expect-error pdfjsLib injetado via script tag
        const pdfjsLib = window.pdfjsLib;
        for (const pdf of pdfs) {
          setProgresso(`Convertendo ${pdf.name}…`);
          const arr = new Uint8Array(await pdf.arrayBuffer());
          const doc = await pdfjsLib.getDocument({ data: arr }).promise;
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: 2 }); // 2x = qualidade boa
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width; canvas.height = viewport.height;
            const ctx = canvas.getContext("2d")!;
            await page.render({ canvasContext: ctx, viewport }).promise;
            const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), "image/jpeg", 0.92));
            const nome = `${pdf.name.replace(/\.pdf$/i, "")}-p${String(i).padStart(2, "0")}.jpg`;
            enviar.push(new File([blob], nome, { type: "image/jpeg" }));
            setProgresso(`Convertendo ${pdf.name}: página ${i}/${doc.numPages}`);
          }
        }
      }

      setProgresso(`Subindo ${enviar.length} arquivo(s)…`);
      const fd = new FormData();
      for (const f of enviar) fd.append("file", f);
      const r = await fetch(`/api/admin/campanhas/${campId}/playlist`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "erro no upload");
      notify(`Playlist atualizada: +${enviar.length} item(ns). Reaplique pra atualizar nos players.`, "success");
      load(); onChange();
    } catch (e) {
      notify((e as Error).message || "Erro", "error");
    } finally {
      setBusy(false); setProgresso("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remover(arteId: string) {
    if (!await confirmModal("Remover este item da playlist?")) return;
    const r = await aapi(token, `/api/admin/campanhas/${campId}/playlist?arte_id=${arteId}`, { method: "DELETE" });
    const d = await r.json();
    notify(d.ok ? d.msg : (d.error || "Erro"), d.ok ? "success" : "error");
    if (d.ok) load();
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-200"><Megaphone className="h-4 w-4" /> Playlist do encarte ({itens.length} item{itens.length === 1 ? "" : "s"})</p>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold hover:bg-brand-dark">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {busy ? "Processando…" : "Adicionar (imagens/vídeos/PDF)"}
          <input ref={inputRef} type="file" accept="image/*,video/*,application/pdf" multiple className="hidden" disabled={busy} onChange={e => e.target.files && e.target.files.length && enviarArquivos(e.target.files)} />
        </label>
      </div>
      {progresso && <p className="mb-2 text-xs text-slate-300">{progresso}</p>}
      <p className="mb-2 text-xs text-slate-400">A ordem da reprodução segue a ordem de upload. PDFs são convertidos em uma imagem por página automaticamente.</p>
      <ul className="space-y-1 text-xs">
        {itens.map((it, i) => (
          <li key={it.id} className="flex items-center justify-between rounded bg-white/5 px-2 py-1.5">
            <div><span className="mr-2 text-slate-500">{i + 1}.</span> {it.arte_nome ?? "—"} <span className="ml-2 text-slate-500">({it.arte_tipo})</span></div>
            <button onClick={() => remover(it.id)} className="rounded border border-red-500/30 px-2 py-0.5 text-red-300 hover:bg-red-500/10"><Trash2 className="h-3 w-3" /></button>
          </li>
        ))}
        {!itens.length && <li className="text-slate-500">Nenhum item ainda. Adicione imagens, vídeos ou um PDF.</li>}
      </ul>
    </div>
  );
}

let _pdfJsLoaded = false;
async function carregarPdfJs(): Promise<void> {
  if (_pdfJsLoaded) return;
  if (typeof window === "undefined") return;
  // @ts-expect-error injetado por script externo
  if (window.pdfjsLib) { _pdfJsLoaded = true; return; }
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("falha ao carregar pdfjs"));
    document.head.appendChild(s);
  });
  // @ts-expect-error
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  _pdfJsLoaded = true;
}

// ─── Dropdown checklist de locais ───────────────────────────────────────────
function LocaisDropdown({ locais, selecionados, onToggle, onTodos, onNenhum }: { locais: Local[]; selecionados: string[]; onToggle: (id: string) => void; onTodos: () => void; onNenhum: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    if (aberto) document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const filtrados = locais.filter(l =>
    !busca || l.nome.toLowerCase().includes(busca.toLowerCase()) || (l.cidade ?? "").toLowerCase().includes(busca.toLowerCase())
  );
  const resumo = selecionados.length === 0
    ? "Clique para escolher os locais…"
    : selecionados.length === 1
      ? locais.find(l => l.id === selecionados[0])?.nome ?? "1 local"
      : `${selecionados.length} locais selecionados`;

  return (
    <div ref={ref} className="relative mb-3">
      <button type="button" onClick={() => setAberto(s => !s)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm outline-none hover:bg-white/10">
        <span className={selecionados.length ? "text-white" : "text-slate-400"}>{resumo}</span>
        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${aberto ? "rotate-90" : ""}`} />
      </button>
      {aberto && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-white/10 bg-[#12121c] shadow-xl">
          <div className="border-b border-white/10 p-2">
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar local…" autoFocus className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none" />
            <div className="mt-2 flex justify-between text-xs">
              <button type="button" onClick={onTodos} className="text-brand-light hover:underline">Marcar todos</button>
              <button type="button" onClick={onNenhum} className="text-slate-400 hover:underline">Desmarcar todos</button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtrados.map(l => (
              <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/5">
                <input type="checkbox" checked={selecionados.includes(l.id)} onChange={() => onToggle(l.id)} className="h-4 w-4 accent-brand" />
                <span className="flex-1">
                  {l.tipo === "grupo" && <span className="mr-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">GRUPO</span>}
                  {l.nome}
                  {l.cidade ? <span className="text-slate-500"> · {l.cidade}</span> : null}
                  {l.tipo === "grupo" && l.qtd_membros != null && <span className="ml-1 text-[10px] text-amber-300">({l.qtd_membros} telas{l.sincronia ? ", sync" : ""})</span>}
                </span>
                {l.tipo !== "grupo" && l.largura > 0 && l.altura > 0 && <span className="text-[10px] text-slate-500">{l.largura}×{l.altura}</span>}
              </label>
            ))}
            {!filtrados.length && <p className="p-3 text-center text-xs text-slate-500">{busca ? "Nenhum local encontrado." : "Cadastre locais antes."}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
