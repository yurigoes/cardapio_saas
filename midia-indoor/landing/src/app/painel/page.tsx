"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import {
  Tv, Upload, Loader2, LogOut, Megaphone, BarChart3, RefreshCw, Calendar, MapPin, Clock,
} from "lucide-react";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Me { conta: { nome: string; empresa: string; email: string } }
interface Camp {
  id: string; nome: string; tipo: string; dias: number; insercoes_dia: number; segundos: number;
  data_inicio: string | null; data_fim: string | null; status: string; status_pagamento: string;
  arte_nome: string | null; valor: string; locais: number;
}

const TIPO_LABEL: Record<string, string> = { video: "Vídeo", banner_estatico: "Banner estático", banner_eletronico: "Banner eletrônico", peca: "Peça publicitária" };
const STATUS_LABEL: Record<string, { txt: string; cls: string }> = {
  rascunho:        { txt: "Em preparação", cls: "text-slate-400" },
  aguardando_arte: { txt: "Aguardando arte", cls: "text-amber-300" },
  no_ar:           { txt: "No ar", cls: "text-emerald-300" },
  pausada:         { txt: "Pausada", cls: "text-amber-300" },
  encerrada:       { txt: "Encerrada", cls: "text-slate-500" },
};

function api(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
}

function Painel() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState(""); const [senha, setSenha] = useState("");
  const [logBusy, setLogBusy] = useState(false); const [logErr, setLogErr] = useState("");

  useEffect(() => { setToken(localStorage.getItem("midia_token")); }, []);

  const carregar = useCallback(async (tk: string) => {
    setLoading(true);
    try {
      const rm = await api(tk, "/api/painel/me");
      if (rm.status === 401) { localStorage.removeItem("midia_token"); setToken(null); return; }
      const dm = await rm.json(); if (dm.ok) setMe(dm);
      const rc = await api(tk, "/api/painel/campanhas"); const dc = await rc.json();
      if (dc.ok) setCamps(dc.campanhas);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (token) carregar(token); else setLoading(false); }, [token, carregar]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setLogBusy(true); setLogErr("");
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha }) });
      const d = await r.json();
      if (!d.ok) { setLogErr(d.error || "Login inválido"); return; }
      localStorage.setItem("midia_token", d.token); setToken(d.token);
    } catch { setLogErr("Erro de conexão"); } finally { setLogBusy(false); }
  }
  function sair() { localStorage.removeItem("midia_token"); setToken(null); setMe(null); }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (!token || !me) {
    return (
      <div className="mx-auto max-w-sm px-6 py-24">
        <div className="mb-8 flex items-center justify-center gap-2 text-brand-light">
          <Tv className="h-6 w-6" /><span className="font-bold">Three Digital Mídia</span>
        </div>
        <h1 className="text-center text-2xl font-bold">Área do anunciante</h1>
        <form onSubmit={entrar} className="mt-8 space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="E-mail"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-brand/50" />
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required placeholder="Senha"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-brand/50" />
          {logErr && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{logErr}</p>}
          <button disabled={logBusy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold hover:bg-brand-dark disabled:opacity-50">
            {logBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Entrar
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">Acesso fornecido pela Three Digital. Sem login? <Link href="/" className="text-brand-light hover:underline">Fale conosco</Link></p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-brand-light"><Tv className="h-6 w-6" /><span className="font-bold">Three Digital Mídia</span></div>
        <button onClick={sair} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"><LogOut className="h-4 w-4" /> Sair</button>
      </header>

      <div className="mt-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Olá, {me.conta.nome.split(" ")[0]} 👋</h1>
          <p className="text-slate-400">{me.conta.empresa} · suas campanhas</p>
        </div>
        <button onClick={() => carregar(token)} className="rounded-xl border border-white/10 p-2 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <div className="mt-6 space-y-4">
        {camps.map(c => <CampanhaCard key={c.id} token={token} camp={c} onChange={() => carregar(token)} />)}
        {!camps.length && (
          <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-500">
            <Megaphone className="mx-auto mb-3 h-8 w-8" />
            Nenhuma campanha ainda. Assim que a Three Digital criar sua campanha, ela aparece aqui pra você enviar a arte.
          </div>
        )}
      </div>
    </div>
  );
}

function CampanhaCard({ token, camp, onChange }: { token: string; camp: Camp; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rel, setRel] = useState<{ plays: number; duracao: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const st = STATUS_LABEL[camp.status] ?? { txt: camp.status, cls: "text-slate-400" };

  async function enviarArte(file: File) {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch(`/api/painel/campanhas/${camp.id}/arte`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const d = await r.json(); setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!d.ok) { setErr(d.error || "Erro no upload"); return; }
    onChange();
  }
  async function verRelatorio() {
    const r = await api(token, `/api/painel/campanhas/${camp.id}/relatorio`); const d = await r.json();
    if (d.ok && d.relatorio) setRel(d.relatorio); else setRel({ plays: 0, duracao: 0 });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{camp.nome}</h3>
          <p className="text-xs text-slate-400">{TIPO_LABEL[camp.tipo] ?? camp.tipo}</p>
        </div>
        <span className={`text-sm font-medium ${st.cls}`}>{st.txt}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat icon={Clock}    label="Inserções/dia" v={`${camp.insercoes_dia}`} />
        <Stat icon={Clock}    label="Duração" v={`${camp.segundos}s`} />
        <Stat icon={MapPin}   label="Locais" v={`${camp.locais}`} />
        <Stat icon={Calendar} label="Período" v={camp.data_inicio ? `${camp.data_inicio}${camp.data_fim ? ` → ${camp.data_fim}` : ""}` : `${camp.dias} dias`} />
      </div>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {camp.arte_nome ? "Trocar arte" : "Enviar arte"}
          <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) enviarArte(f); }} />
        </label>
        {camp.status === "no_ar" && (
          <button onClick={verRelatorio} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5"><BarChart3 className="h-4 w-4" /> Ver relatório</button>
        )}
        {camp.arte_nome && <span className="text-xs text-slate-500">Arte: {camp.arte_nome}</span>}
      </div>

      {rel && (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-200">
          <p className="flex items-center gap-2 font-medium"><BarChart3 className="h-4 w-4" /> Exibições até agora</p>
          <p className="mt-1">{rel.plays} inserções tocadas · {Math.round(rel.duracao)}s no total</p>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, v }: { icon: typeof Clock; label: string; v: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="flex items-center gap-1 text-xs text-slate-500"><Icon className="h-3 w-3" /> {label}</p>
      <p className="mt-0.5 font-semibold">{v}</p>
    </div>
  );
}

export default function PainelPage() {
  return (
    <main className="min-h-screen bg-[#0a0a12] text-white">
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
        <Painel />
      </Suspense>
    </main>
  );
}
