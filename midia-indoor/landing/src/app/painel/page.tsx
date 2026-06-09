"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import {
  Tv, Upload, Loader2, LogOut, Megaphone, BarChart3, RefreshCw, Calendar, MapPin, Clock,
  CreditCard, LifeBuoy, Plus, Send, X, UserCog, Trash2,
} from "lucide-react";
import { NotifyHost, notify } from "@/components/Notify";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (s: string) => { const d = new Date(s.replace(" ", "T")); return isNaN(+d) ? s : d.toLocaleString("pt-BR"); };

interface Me { conta: { nome: string; empresa: string; email: string; papel?: string; operador?: string | null } }
interface Operador { id: string; nome: string; email: string; role: string; ativo: boolean; created_at: string; }
interface Camp {
  id: string; nome: string; tipo: string; dias: number; insercoes_dia: number; segundos: number;
  data_inicio: string | null; data_fim: string | null; status: string; status_pagamento: string;
  arte_nome: string | null; arte_tipo: string | null; valor: string; locais: number;
  arte_status?: string; arte_rejeicao_motivo?: string | null;
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
  const [aba, setAba] = useState<"campanhas" | "suporte" | "usuarios">("campanhas");

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
    return <LoginAnunciante onSubmit={entrar} email={email} setEmail={setEmail} senha={senha} setSenha={setSenha} busy={logBusy} err={logErr} />;
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
        {(() => {
          const tabs: [typeof aba, string, React.ElementType][] = [["campanhas", "Campanhas", Megaphone], ["suporte", "Suporte", LifeBuoy]];
          if ((me.conta.papel ?? "owner") === "owner") tabs.push(["usuarios", "Usuários", UserCog]);
          return tabs.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setAba(id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition ${aba === id ? "border-b-2 border-brand text-white" : "text-slate-400 hover:text-white"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ));
        })()}
      </nav>

      {aba === "campanhas" && (
        <div className="mt-6 space-y-4">
          {camps.map(c => <CampanhaCard key={c.id} token={token} camp={c} onChange={() => carregar(token)} />)}
          {!camps.length && (
            <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-500">
              <Megaphone className="mx-auto mb-3 h-8 w-8" />
              Nenhuma campanha ainda. Assim que a Three Digital criar sua campanha, ela aparece aqui.
            </div>
          )}
        </div>
      )}
      {aba === "suporte"  && <Suporte token={token} />}
      {aba === "usuarios" && <Usuarios token={token} />}
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
  const [payModal, setPayModal] = useState<{ link: string } | null>(null);
  async function pagar() {
    setPayBusy(true);
    const r = await api(token, `/api/painel/campanhas/${camp.id}/cobrar-infinity`, { method: "POST" });
    const d = await r.json(); setPayBusy(false);
    if (!d.ok || !d.link) { notify(d.error || "Erro ao gerar pagamento", "error"); return; }
    setPayModal({ link: d.link });
  }
  // Polling de status quando modal aberto
  useEffect(() => {
    if (!payModal) return;
    const interval = setInterval(async () => {
      const r = await api(token, `/api/painel/campanhas/${camp.id}/status-pagamento`);
      const d = await r.json();
      if (d.ok && d.status === "pago") {
        clearInterval(interval);
        setPayModal(null);
        notify("Pagamento confirmado!", "success");
        onChange();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [payModal, token, camp.id, onChange]);
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

      {precisaPagar && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-orange-500/10 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-200">⏳ Aguardando pagamento</p>
              <p className="mt-0.5 text-xs text-amber-200/80">Pague {brl(Number(camp.valor))} via PIX ou cartão até 12x pra liberar o envio de arte e veiculação.</p>
            </div>
            <button onClick={pagar} disabled={payBusy} className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 disabled:opacity-50">
              {payBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Pagar agora
            </button>
          </div>
        </div>
      )}

      {camp.arte_nome && <ArtePreview token={token} campId={camp.id} tipo={camp.arte_tipo} nome={camp.arte_nome} />}

      {camp.arte_status === "aguardando_aprovacao" && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">⏳ Arte enviada — aguardando aprovação da Three Digital.</div>
      )}
      {camp.arte_status === "rejeitada" && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          ✖ Arte rejeitada{camp.arte_rejeicao_motivo ? `: ${camp.arte_rejeicao_motivo}` : ""}. Envie uma nova versão.
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat icon={Clock}    label="Inserções/dia" v={`${camp.insercoes_dia}`} />
        <Stat icon={Clock}    label="Duração" v={`${camp.segundos}s`} />
        <Stat icon={MapPin}   label="Locais" v={`${camp.locais}`} />
        <Stat icon={Calendar} label="Período" v={camp.data_inicio ? `${camp.data_inicio}${camp.data_fim ? ` → ${camp.data_fim}` : ""}` : `${camp.dias} dias`} />
      </div>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${precisaPagar ? "cursor-not-allowed bg-slate-700/50 text-slate-500" : "cursor-pointer bg-brand hover:bg-brand-dark"}`} title={precisaPagar ? "Pague primeiro pra enviar a arte" : ""}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {camp.arte_nome ? "Trocar arte" : "Enviar arte"}
          <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" disabled={busy || precisaPagar} onChange={e => { const f = e.target.files?.[0]; if (f) enviarArte(f); }} />
        </label>
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

      {payModal && <ModalPagamento link={payModal.link} valor={Number(camp.valor)} onClose={() => setPayModal(null)} />}
    </div>
  );
}

function ModalPagamento({ link, valor, onClose }: { link: string; valor: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="flex w-full max-w-md flex-col rounded-2xl border border-white/15 bg-[#0a0a12] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">💳 Pagar campanha</h3>
            <p className="text-xs text-slate-400">{brl(valor)} via PIX ou cartão até 12x</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">
          <p className="mb-4 text-sm text-slate-300">Clique no botão abaixo pra abrir a página segura da <strong>InfinityPay</strong>. Assim que o pagamento for confirmado, esta tela atualiza automaticamente.</p>
          <a href={link} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 px-6 py-3 text-base font-bold text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50">
            <CreditCard className="h-5 w-5" /> Abrir página de pagamento
          </a>
          <div className="mt-4 rounded-lg bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
            <p className="flex items-center gap-2 font-semibold">⏳ Aguardando confirmação...</p>
            <p className="mt-1 text-emerald-200/80">Verificamos seu pagamento a cada 3 segundos. Pode fechar essa janela e abrir depois — quando pago, libera automaticamente.</p>
          </div>
          <p className="mt-4 text-center text-[10px] text-slate-500">Pagamento processado por CloudWalk InfinityPay · seguro e auditado</p>
        </div>
      </div>
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
    <div className="overlay-in fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className={`drawer-in absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto border-l border-white/10 bg-[#12121c] p-6 shadow-2xl sm:w-[70%] ${wide ? "max-w-3xl" : "max-w-xl"}`}>
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

// ─── Multi-usuário ──────────────────────────────────────────────────────────
function Usuarios({ token }: { token: string }) {
  const [lista, setLista] = useState<Operador[]>([]);
  const [novo, setNovo] = useState(false);
  const load = useCallback(async () => {
    const r = await api(token, "/api/painel/usuarios"); const d = await r.json();
    if (d.ok) setLista(d.usuarios);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function toggle(u: Operador) {
    await api(token, "/api/painel/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, ativo: !u.ativo }),
    });
    load();
  }
  async function remover(u: Operador) {
    if (!confirm(`Remover ${u.nome}? Essa ação não pode ser desfeita.`)) return;
    await api(token, "/api/painel/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, remover: true }),
    });
    load();
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-400">Convide colaboradores da sua empresa para enviar artes e acompanhar campanhas.</p>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo usuário</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Nome</th><th className="p-3">E-mail</th><th className="p-3">Papel</th><th className="p-3">Ativo</th><th className="p-3"></th></tr></thead>
          <tbody>
            {lista.map(u => (
              <tr key={u.id} className="border-t border-white/5">
                <td className="p-3">{u.nome}</td>
                <td className="p-3 text-xs">{u.email}</td>
                <td className="p-3 text-xs capitalize">{u.role}</td>
                <td className="p-3"><button onClick={() => toggle(u)} className={`rounded px-2 py-1 text-xs ${u.ativo ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-slate-400"}`}>{u.ativo ? "Sim" : "Não"}</button></td>
                <td className="p-3 text-right"><button onClick={() => remover(u)} className="rounded border border-red-500/30 p-1.5 text-red-300 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Nenhum usuário adicional.</td></tr>}
          </tbody>
        </table>
      </div>
      {novo && <NovoUsuarioModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
    </div>
  );
}

function NovoUsuarioModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(""); const [email, setEmail] = useState(""); const [senha, setSenha] = useState("");
  const [role, setRole] = useState("operador");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function salvar() {
    setBusy(true); setErr("");
    const r = await api(token, "/api/painel/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha, role }),
    });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12121c] p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="font-bold">Novo usuário</h3><button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome" className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha (min 6)" className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
        <label className="mb-1 block text-xs text-slate-400">Papel</label>
        <select value={role} onChange={e => setRole(e.target.value)} className="mb-4 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
          <option value="operador">Operador</option>
          <option value="gerente">Gerente</option>
        </select>
        {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
        <button onClick={salvar} disabled={busy || !nome || !email || senha.length < 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar</button>
      </div>
    </div>
  );
}


function LoginAnunciante({ onSubmit, email, setEmail, senha, setSenha, busy, err }: { onSubmit: (e: React.FormEvent) => void; email: string; setEmail: (v: string) => void; senha: string; setSenha: (v: string) => void; busy: boolean; err: string }) {
  const [bgUrl, setBgUrl] = useState("");
  useEffect(() => {
    const v = Math.floor(Date.now() / 60000);
    fetch(`/api/publico/login-wallpaper?v=${v}`, { method: "HEAD" })
      .then(r => { if (r.ok) setBgUrl(`/api/publico/login-wallpaper?v=${v}`); })
      .catch(() => {});
  }, []);
  const bgStyle: React.CSSProperties = bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : {};
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#0a0a12] px-4 text-white md:justify-end md:px-12 lg:px-20" style={bgStyle}>
      <form onSubmit={onSubmit} className="relative z-10 w-full max-w-sm rounded-3xl border border-white/25 bg-white/10 px-7 py-9 shadow-[0_8px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150">
        <div className="mb-7 flex items-center justify-center gap-2 text-white">
          <Tv className="h-7 w-7 text-brand-light" />
          <span className="text-lg font-bold drop-shadow">Anunciante · Three Digital</span>
        </div>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="E-mail" className="mb-3 w-full rounded-xl border border-white/20 bg-white/15 px-4 py-3 text-sm text-white placeholder-white/60 outline-none transition focus:border-brand-light focus:bg-white/25" />
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required placeholder="Senha" className="mb-3 w-full rounded-xl border border-white/20 bg-white/15 px-4 py-3 text-sm text-white placeholder-white/60 outline-none transition focus:border-brand-light focus:bg-white/25" />
        {err && <p className="mb-3 rounded-lg border border-red-300/40 bg-red-500/20 px-4 py-2 text-sm text-red-100">{err}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Entrar</button>
        <p className="mt-4 text-center text-xs text-white/70">Sem login? <Link href="/" className="font-semibold text-brand-light hover:underline">Fale conosco</Link></p>
      </form>
    </main>
  );
}
