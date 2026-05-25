"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import {
  Tv, Upload, Loader2, LogOut, Megaphone, BarChart3, RefreshCw, Calendar, MapPin, Clock,
  CreditCard, LifeBuoy, Plus, Send, X,
} from "lucide-react";
import { NotifyHost, notify } from "@/components/Notify";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (s: string) => { const d = new Date(s.replace(" ", "T")); return isNaN(+d) ? s : d.toLocaleString("pt-BR"); };

interface Me { conta: { nome: string; empresa: string; email: string } }
interface Camp {
  id: string; nome: string; tipo: string; dias: number; insercoes_dia: number; segundos: number;
  data_inicio: string | null; data_fim: string | null; status: string; status_pagamento: string;
  arte_nome: string | null; arte_tipo: string | null; valor: string; locais: number;
}
interface Exibicao { start: string; display: string; numberPlays: number; duration: number; }

const TIPO_LABEL: Record<string, string> = { video: "Vídeo", banner_estatico: "Banner estático", banner_eletronico: "Banner eletrônico", peca: "Peça publicitária" };
const STATUS_LABEL: Record<string, { txt: string; cls: string }> = {
  rascunho: { txt: "Em preparação", cls: "text-slate-400" },
  aguardando_arte: { txt: "Aguardando arte", cls: "text-amber-300" },
  no_ar: { txt: "No ar", cls: "text-emerald-300" },
  pausada: { txt: "Pausada", cls: "text-amber-300" },
  encerrada: { txt: "Encerrada", cls: "text-slate-500" },
};

function api(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
}

function Painel() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<"campanhas" | "suporte">("campanhas");

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
        <div className="mb-8 flex items-center justify-center gap-2 text-brand-light"><Tv className="h-6 w-6" /><span className="font-bold">Three Digital Mídia</span></div>
        <h1 className="text-center text-2xl font-bold">Área do anunciante</h1>
        <form onSubmit={entrar} className="mt-8 space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="E-mail" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-brand/50" />
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required placeholder="Senha" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-brand/50" />
          {logErr && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{logErr}</p>}
          <button disabled={logBusy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold hover:bg-brand-dark disabled:opacity-50">{logBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Entrar</button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">Acesso fornecido pela Three Digital. Sem login? <Link href="/" className="text-brand-light hover:underline">Fale conosco</Link></p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <NotifyHost />
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-brand-light"><Tv className="h-6 w-6" /><span className="font-bold">Three Digital Mídia</span></div>
        <button onClick={sair} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"><LogOut className="h-4 w-4" /> Sair</button>
      </header>

      <div className="mt-8 flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Olá, {me.conta.nome.split(" ")[0]} 👋</h1><p className="text-slate-400">{me.conta.empresa}</p></div>
        <button onClick={() => carregar(token)} className="rounded-xl border border-white/10 p-2 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <nav className="mt-6 flex gap-1 border-b border-white/10">
        {([["campanhas", "Campanhas", Megaphone], ["suporte", "Suporte", LifeBuoy]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setAba(id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition ${aba === id ? "border-b-2 border-brand text-white" : "text-slate-400 hover:text-white"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </nav>

      {aba === "campanhas" ? (
        <div className="mt-6 space-y-4">
          {camps.map(c => <CampanhaCard key={c.id} token={token} camp={c} onChange={() => carregar(token)} />)}
          {!camps.length && (
            <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-500">
              <Megaphone className="mx-auto mb-3 h-8 w-8" />
              Nenhuma campanha ainda. Assim que a Three Digital criar sua campanha, ela aparece aqui.
            </div>
          )}
        </div>
      ) : (
        <Suporte token={token} />
      )}
    </div>
  );
}

function CampanhaCard({ token, camp, onChange }: { token: string; camp: Camp; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rel, setRel] = useState<{ resumo: { plays: number; duracao: number }; exibicoes: Exibicao[] } | null>(null);
  const [verRel, setVerRel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const st = STATUS_LABEL[camp.status] ?? { txt: camp.status, cls: "text-slate-400" };
  const precisaPagar = camp.status_pagamento === "pendente" && Number(camp.valor) > 0;

  async function enviarArte(file: File) {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch(`/api/painel/campanhas/${camp.id}/arte`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const d = await r.json(); setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!d.ok) { notify(d.error || "Erro no upload", "error"); return; }
    notify("Arte enviada com sucesso", "success");
    onChange();
  }
  async function pagar() {
    setPayBusy(true);
    const r = await api(token, `/api/painel/campanhas/${camp.id}/pagar`, { method: "POST" });
    const d = await r.json(); setPayBusy(false);
    if (!d.ok || !d.init_point) { notify(d.error || "Erro ao gerar pagamento", "error"); return; }
    window.location.href = d.init_point;
  }
  async function carregarRel() {
    setVerRel(true);
    const r = await api(token, `/api/painel/campanhas/${camp.id}/relatorio`); const d = await r.json();
    if (d.ok) setRel({ resumo: d.relatorio ?? { plays: 0, duracao: 0 }, exibicoes: d.exibicoes ?? [] });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="text-lg font-semibold">{camp.nome}</h3><p className="text-xs text-slate-400">{TIPO_LABEL[camp.tipo] ?? camp.tipo}</p></div>
        <div className="text-right">
          <span className={`text-sm font-medium ${st.cls}`}>{st.txt}</span>
          <div className="text-xs text-slate-500">{precisaPagar ? "Pagamento pendente" : camp.status_pagamento === "pago" ? "Pago ✓" : ""}</div>
        </div>
      </div>

      {camp.arte_nome && <ArtePreview token={token} campId={camp.id} tipo={camp.arte_tipo} nome={camp.arte_nome} />}

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
        {precisaPagar && (
          <button onClick={pagar} disabled={payBusy} className="flex items-center gap-2 rounded-xl border border-emerald-500/40 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">
            {payBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Pagar {brl(Number(camp.valor))} (PIX/cartão)
          </button>
        )}
        {camp.status === "no_ar" && (
          <button onClick={carregarRel} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5"><BarChart3 className="h-4 w-4" /> Relatório de exibições</button>
        )}
        {camp.arte_nome && <span className="text-xs text-slate-500">Arte: {camp.arte_nome}</span>}
      </div>

      {verRel && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          {!rel ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : (
            <>
              <p className="flex items-center gap-2 font-medium text-emerald-300"><BarChart3 className="h-4 w-4" /> {rel.resumo.plays} inserções tocadas · {Math.round(rel.resumo.duracao)}s no total</p>
              {rel.exibicoes.length ? (
                <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-white/10">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#12121c] text-left text-slate-400"><tr><th className="p-2">Data/hora</th><th className="p-2">Local / Tela</th><th className="p-2 text-right">Exibições</th></tr></thead>
                    <tbody>
                      {rel.exibicoes.map((e, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="p-2 whitespace-nowrap">{dataHora(e.start)}</td>
                          <td className="p-2">{e.display}</td>
                          <td className="p-2 text-right font-medium">{e.numberPlays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="mt-2 text-xs text-slate-500">Ainda sem exibições registradas para o período.</p>}
              <p className="mt-2 text-[11px] text-slate-600">Dados de proof-of-play coletados dos players. Pode haver atraso de algumas horas até a sincronização.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, v }: { icon: typeof Clock; label: string; v: string }) {
  return <div className="rounded-xl bg-white/5 p-3"><p className="flex items-center gap-1 text-xs text-slate-500"><Icon className="h-3 w-3" /> {label}</p><p className="mt-0.5 font-semibold">{v}</p></div>;
}

function ArtePreview({ token, campId, tipo, nome }: { token: string; campId: string; tipo: string | null; nome: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let revoked = false; let objUrl = "";
    api(token, `/api/painel/campanhas/${campId}/arte`).then(async r => {
      if (!r.ok) { setErro(true); return; }
      const blob = await r.blob(); objUrl = URL.createObjectURL(blob);
      if (!revoked) setUrl(objUrl);
    }).catch(() => setErro(true));
    return () => { revoked = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [token, campId]);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/30">
      {erro ? (
        <div className="flex h-40 items-center justify-center text-xs text-slate-500">Não foi possível carregar a prévia ({nome})</div>
      ) : !url ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
      ) : tipo === "video" ? (
        <video src={url} controls className="max-h-72 w-full bg-black object-contain" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={nome} className="max-h-72 w-full object-contain" />
      )}
    </div>
  );
}

// ─── Suporte (chamados) ─────────────────────────────────────────────────────
interface Chamado { id: string; assunto: string; status: string; ultima_msg: string | null; updated_at: string; }
interface ChatMsg { autor: string; mensagem: string; created_at: string; }
function Suporte({ token }: { token: string }) {
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState<Chamado | null>(null);
  const load = useCallback(async () => { const r = await api(token, "/api/painel/chamados"); const d = await r.json(); if (d.ok) setChamados(d.chamados); }, [token]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Meus chamados</h2>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Abrir chamado</button>
      </div>
      <div className="space-y-2">
        {chamados.map(c => (
          <button key={c.id} onClick={() => setAberto(c)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10">
            <div><p className="font-medium">{c.assunto}</p>{c.ultima_msg && <p className="truncate text-xs text-slate-400">{c.ultima_msg}</p>}</div>
            <span className={`text-xs ${c.status === "aberto" ? "text-amber-300" : c.status === "respondido" ? "text-emerald-300" : "text-slate-500"}`}>{c.status}</span>
          </button>
        ))}
        {!chamados.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-500">Nenhum chamado. Precisa de algo? Abra um chamado.</p>}
      </div>
      {novo && <NovoChamado token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
      {aberto && <ChatChamado token={token} chamado={aberto} onClose={() => { setAberto(null); load(); }} />}
    </div>
  );
}
function NovoChamado({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [assunto, setAssunto] = useState(""); const [mensagem, setMensagem] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function enviar() {
    setBusy(true); setErr("");
    const r = await api(token, "/api/painel/chamados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assunto, mensagem }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <Modal title="Abrir chamado" onClose={onClose}>
      <label className="mb-1 block text-sm text-slate-300">Assunto</label>
      <input value={assunto} onChange={e => setAssunto(e.target.value)} placeholder="ex: Trocar a arte da campanha" className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
      <label className="mb-1 block text-sm text-slate-300">Mensagem</label>
      <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={5} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
      <button onClick={enviar} disabled={busy || !assunto || !mensagem} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enviar</button>
    </Modal>
  );
}
function ChatChamado({ token, chamado, onClose }: { token: string; chamado: Chamado; onClose: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [txt, setTxt] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await api(token, `/api/painel/chamados/${chamado.id}`); const d = await r.json(); if (d.ok) setMsgs(d.mensagens); }, [token, chamado.id]);
  useEffect(() => { load(); }, [load]);
  async function enviar() {
    if (!txt.trim()) return;
    setBusy(true);
    await api(token, `/api/painel/chamados/${chamado.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensagem: txt }) });
    setTxt(""); setBusy(false); load();
  }
  return (
    <Modal title={chamado.assunto} onClose={onClose} wide>
      <div className="mb-3 max-h-80 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <div key={i} className={`rounded-xl px-3 py-2 text-sm ${m.autor === "cliente" ? "ml-8 bg-brand/20" : "mr-8 bg-white/5"}`}>
            <p className="text-[11px] text-slate-400">{m.autor === "cliente" ? "Você" : "Three Digital"} · {dataHora(m.created_at)}</p>
            <p className="whitespace-pre-wrap">{m.mensagem}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === "Enter") enviar(); }} placeholder="Escreva uma mensagem…" className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
        <button onClick={enviar} disabled={busy} className="rounded-xl bg-brand px-4 hover:bg-brand-dark disabled:opacity-50"><Send className="h-4 w-4" /></button>
      </div>
    </Modal>
  );
}

function Modal({ children, title, onClose, wide }: { children: React.ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#12121c] p-6 ${wide ? "max-w-xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
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
