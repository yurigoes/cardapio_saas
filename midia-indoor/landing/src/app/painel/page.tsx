"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Tv, Upload, Loader2, LogOut, Image as ImageIcon, Film, MonitorPlay,
  CheckCircle2, RefreshCw, Plus, CreditCard,
} from "lucide-react";
import { formatBRL } from "@/lib/planos";

interface Me {
  conta: { nome: string; empresa: string; email: string; status: string; provisionado: boolean };
  assinatura: { plano: string; qtd_telas: number; status: string; proximo_venc: string | null; total_mensal: number } | null;
}
interface Midia { mediaId: number; name: string; mediaType: string; fileSize: number; duration: number; }
interface Tela  { id: string; nome: string; xibo_display_id: number | null; status: string; }
interface Pendente { displayId: number; display: string; lastAccessed: string; }

function api(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
}

function Painel() {
  const sp = useSearchParams();
  const pago = sp.get("pago") === "1";

  const [token, setToken] = useState<string | null>(null);
  const [me, setMe]       = useState<Me | null>(null);
  const [midias, setMidias]       = useState<Midia[]>([]);
  const [telas, setTelas]         = useState<Tela[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [loading, setLoading]     = useState(true);
  const [msg, setMsg]             = useState("");

  // login local
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [logBusy, setLogBusy] = useState(false);
  const [logErr, setLogErr]   = useState("");

  useEffect(() => { setToken(localStorage.getItem("midia_token")); }, []);

  const carregar = useCallback(async (tk: string) => {
    setLoading(true);
    try {
      const rm = await api(tk, "/api/painel/me");
      if (rm.status === 401) { localStorage.removeItem("midia_token"); setToken(null); return; }
      const dm = await rm.json();
      if (!dm.ok) { setMsg(dm.error); return; }
      setMe(dm);

      if (dm.conta.provisionado) {
        const [rmid, rtel] = await Promise.all([
          api(tk, "/api/painel/midias"),
          api(tk, "/api/painel/telas"),
        ]);
        const dmid = await rmid.json(); if (dmid.ok) setMidias(dmid.midias ?? []);
        const dtel = await rtel.json(); if (dtel.ok) { setTelas(dtel.telas ?? []); setPendentes(dtel.pendentes ?? []); }
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (token) carregar(token); else setLoading(false); }, [token, carregar]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setLogBusy(true); setLogErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const d = await r.json();
      if (!d.ok) { setLogErr(d.error || "Login inválido"); return; }
      localStorage.setItem("midia_token", d.token);
      setToken(d.token);
    } catch { setLogErr("Erro de conexão"); }
    finally { setLogBusy(false); }
  }

  function sair() { localStorage.removeItem("midia_token"); setToken(null); setMe(null); }

  // Refaz/retoma o pagamento (PIX ou cartão) — gera novo link de checkout do MP
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr]   = useState("");
  async function reverPagamento() {
    if (!token) return;
    setPayBusy(true); setPayErr("");
    try {
      const r = await api(token, "/api/pagamento/criar", { method: "POST" });
      const d = await r.json();
      if (!d.ok || !d.init_point) { setPayErr(d.error || "Não foi possível gerar o pagamento"); return; }
      window.location.href = d.init_point;   // checkout do MP (PIX ou cartão)
    } catch { setPayErr("Erro de conexão"); }
    finally { setPayBusy(false); }
  }

  // ─── Telas de auth ──────────────────────────────────────────────────
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!token || !me) {
    return (
      <div className="mx-auto max-w-sm px-6 py-24">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-brand-light">
          <Tv className="h-6 w-6" /><span className="font-bold">Three Digital Mídia</span>
        </Link>
        <h1 className="text-center text-2xl font-bold">Área do cliente</h1>
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
        <p className="mt-4 text-center text-xs text-slate-500">
          Não tem conta? <Link href="/cadastro" className="text-brand-light hover:underline">Assinar agora</Link>
        </p>
      </div>
    );
  }

  const ativa = me.conta.status === "ativo" && me.conta.provisionado;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-brand-light">
          <Tv className="h-6 w-6" /><span className="font-bold">Three Digital Mídia</span>
        </div>
        <button onClick={sair} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </header>

      <div className="mt-8">
        <h1 className="text-2xl font-bold">Olá, {me.conta.nome.split(" ")[0]} 👋</h1>
        <p className="text-slate-400">{me.conta.empresa}</p>
      </div>

      {pago && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="h-5 w-5" /> Pagamento recebido! Sua conta está sendo ativada.
        </div>
      )}

      {/* Status da assinatura */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-sm text-slate-400">Plano</span>
            <p className="text-lg font-semibold capitalize">{me.assinatura?.plano ?? "—"}</p>
          </div>
          <div>
            <span className="text-sm text-slate-400">Telas contratadas</span>
            <p className="text-lg font-semibold">{me.assinatura?.qtd_telas ?? 0}</p>
          </div>
          <div>
            <span className="text-sm text-slate-400">Mensalidade</span>
            <p className="text-lg font-semibold">{me.assinatura ? formatBRL(me.assinatura.total_mensal) : "—"}</p>
          </div>
          <StatusBadge status={me.conta.status} />
        </div>
      </section>

      {!ativa ? (
        // Pagamento pendente/não confirmado → pedir pra concluir (PIX ou cartão).
        // Caso já pago mas ainda provisionando, mostramos só o aviso de ativação.
        (me.assinatura?.status !== "ativa") ? (
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
            <p className="font-semibold">Pagamento pendente</p>
            <p className="mt-1 text-sm text-amber-200/90">
              Sua assinatura ainda não foi confirmada. Conclua o pagamento para liberar o
              upload de mídia e o pareamento das TVs. Você pode pagar com <strong>PIX</strong> ou
              <strong> cartão</strong> — é só escolher na tela do Mercado Pago.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={reverPagamento} disabled={payBusy}
                className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                {payBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {payBusy ? "Gerando…" : "Concluir pagamento (PIX ou cartão)"}
              </button>
              <button onClick={() => carregar(token)} className="flex items-center gap-2 rounded-lg border border-amber-400/30 px-3 py-2 text-sm hover:bg-amber-500/10">
                <RefreshCw className="h-4 w-4" /> Já paguei, verificar
              </button>
            </div>
            {payErr && <p className="mt-3 text-sm text-red-300">{payErr}</p>}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-emerald-100">
            <p className="font-semibold">Pagamento confirmado — ativando sua conta</p>
            <p className="mt-1 text-sm text-emerald-200/90">
              Estamos preparando seu ambiente (pastas e telas). Isso costuma levar alguns minutos.
            </p>
            <button onClick={() => carregar(token)} className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-400/30 px-3 py-2 text-sm hover:bg-emerald-500/10">
              <RefreshCw className="h-4 w-4" /> Verificar de novo
            </button>
          </div>
        )
      ) : (
        <>
          <Midias token={token} midias={midias} onChange={() => carregar(token)} />
          <Telas token={token} telas={telas} pendentes={pendentes} onChange={() => carregar(token)} />
        </>
      )}

      {msg && <p className="mt-6 text-sm text-red-400">{msg}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ativo: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    pendente: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    suspenso: "bg-red-500/15 text-red-300 border-red-500/30",
    cancelado: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  };
  return <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${map[status] ?? map.cancelado}`}>{status}</span>;
}

function Midias({ token, midias, onChange }: { token: string; midias: Midia[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(file: File) {
    setBusy(true); setErr("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await api(token, "/api/painel/midias", { method: "POST", body: fd });
      const d = await r.json();
      if (!d.ok) { setErr(d.error || "Erro no upload"); return; }
      onChange();
    } catch { setErr("Erro de conexão"); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Suas mídias</h2>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Enviando…" : "Enviar arquivo"}
          <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" disabled={busy}
            onChange={e => { const f = e.target.files?.[0]; if (f) enviar(f); }} />
        </label>
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}

      {midias.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-500">
          Nenhuma mídia ainda. Envie imagens ou vídeos pra começar.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {midias.map(m => (
            <div key={m.mediaId} className="rounded-xl border border-white/10 bg-white/5 p-4">
              {m.mediaType === "video" ? <Film className="h-8 w-8 text-brand-light" /> : <ImageIcon className="h-8 w-8 text-brand-light" />}
              <p className="mt-2 truncate text-sm font-medium" title={m.name}>{m.name}</p>
              <p className="text-xs text-slate-500">{(m.fileSize / 1048576).toFixed(1)} MB</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Telas({ token, telas, pendentes, onChange }: { token: string; telas: Tela[]; pendentes: Pendente[]; onChange: () => void }) {
  const [sel, setSel]   = useState("");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");

  async function parear(e: React.FormEvent) {
    e.preventDefault();
    if (!sel) { setErr("Escolha um display"); return; }
    setBusy(true); setErr("");
    try {
      const r = await api(token, "/api/painel/telas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayId: Number(sel), nome }),
      });
      const d = await r.json();
      if (!d.ok) { setErr(d.error || "Erro ao parear"); return; }
      setSel(""); setNome(""); onChange();
    } catch { setErr("Erro de conexão"); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">Suas telas (TVs)</h2>

      {telas.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nenhuma tela pareada ainda.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {telas.map(t => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <MonitorPlay className="h-5 w-5 text-brand-light" />
                <span className="font-medium">{t.nome}</span>
              </div>
              <span className="text-xs text-emerald-300">{t.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Parear nova tela */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-brand-light" /> Parear nova TV</p>
        <p className="mt-1 text-xs text-slate-400">
          Instale o app Xibo Player na TV. Quando aparecer o código, o aparelho surge na lista abaixo.
        </p>
        <form onSubmit={parear} className="mt-3 flex flex-wrap gap-3">
          <select value={sel} onChange={e => setSel(e.target.value)}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50">
            <option value="">{pendentes.length ? "Selecione o aparelho…" : "Nenhum aparelho aguardando"}</option>
            {pendentes.map(p => <option key={p.displayId} value={p.displayId}>{p.display}</option>)}
          </select>
          <input value={nome} onChange={e => setNome(e.target.value)} required placeholder="Nome da tela (ex: Frente da loja)"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
          <button disabled={busy || !sel} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Parear
          </button>
        </form>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </div>
    </section>
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
