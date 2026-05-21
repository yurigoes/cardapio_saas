"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Tv, Check, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { PLANOS, formatBRL } from "@/lib/planos";

function CadastroForm() {
  const sp = useSearchParams();
  const planoInicial = sp.get("plano") ?? "profissional";

  const [plano,    setPlano]    = useState(planoInicial);
  const [nome,     setNome]     = useState("");
  const [empresa,  setEmpresa]  = useState("");
  const [email,    setEmail]    = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telas,    setTelas]    = useState("1");
  const [cidade,   setCidade]   = useState("");
  const [obs,      setObs]      = useState("");
  const [busy,     setBusy]     = useState(false);
  const [ok,       setOk]       = useState(false);
  const [err,      setErr]      = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/leads", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plano, nome, empresa, email, whatsapp, telas: Number(telas), cidade, obs }),
      });
      const d = await r.json();
      if (!d.ok) { setErr(d.error || "Erro ao enviar"); return; }
      setOk(true);
    } catch {
      setErr("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const planoSel = PLANOS.find(p => p.id === plano);

  if (ok) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand/15">
          <CheckCircle2 className="h-10 w-10 text-brand-light" />
        </div>
        <h1 className="text-2xl font-bold">Cadastro recebido! 🎉</h1>
        <p className="mt-3 text-slate-300">
          Recebemos seu interesse no plano <strong>{planoSel?.nome}</strong>.
          Nossa equipe vai te chamar no WhatsApp em breve pra ativar sua conta.
        </p>
        <Link href="/" className="mt-8 inline-block rounded-xl border border-white/15 px-6 py-3 font-semibold hover:bg-white/5">
          Voltar ao início
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8 px-6 py-12 md:grid-cols-[1fr_320px]">
      {/* Form */}
      <div>
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <h1 className="text-3xl font-bold">Criar sua conta</h1>
        <p className="mt-2 text-slate-400">Preencha os dados — ativamos em até 1 dia útil.</p>

        <form onSubmit={enviar} className="mt-8 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Plano</label>
            <div className="flex gap-2">
              {PLANOS.map(p => (
                <button key={p.id} type="button" onClick={() => setPlano(p.id)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${plano === p.id ? "border-brand bg-brand/15 text-brand-light" : "border-white/10 text-slate-400 hover:bg-white/5"}`}>
                  {p.nome}
                </button>
              ))}
            </div>
          </div>

          <Field label="Seu nome *"     value={nome}     onChange={setNome}     placeholder="João Silva" required />
          <Field label="Empresa *"      value={empresa}  onChange={setEmpresa}  placeholder="Restaurante XPTO" required />
          <Field label="E-mail *"       value={email}    onChange={setEmail}    placeholder="voce@email.com" type="email" required />
          <Field label="WhatsApp *"     value={whatsapp} onChange={setWhatsapp} placeholder="(11) 99999-9999" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qtde de telas" value={telas}  onChange={setTelas}  placeholder="1" type="number" />
            <Field label="Cidade"        value={cidade} onChange={setCidade} placeholder="São Paulo" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Observações</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
              placeholder="Conte um pouco sobre seu negócio…"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-brand/50" />
          </div>

          {err && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{err}</p>}

          <button type="submit" disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold hover:bg-brand-dark disabled:opacity-50 transition">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Enviando…" : "Quero contratar"}
          </button>
        </form>
      </div>

      {/* Resumo do plano */}
      <aside className="h-fit rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-2">
          <Tv className="h-5 w-5 text-brand-light" />
          <span className="font-semibold">{planoSel?.nome}</span>
        </div>
        <div className="mt-3">
          <span className="text-3xl font-black">{planoSel ? formatBRL(planoSel.preco) : "—"}</span>
          <span className="text-sm text-slate-400">/tela/mês</span>
        </div>
        <ul className="mt-4 space-y-2">
          {planoSel?.recursos.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <Check className="h-3.5 w-3.5 flex-shrink-0 text-brand-light mt-0.5" />{r}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-slate-300">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-brand/50" />
    </div>
  );
}

export default function CadastroPage() {
  return (
    <main className="min-h-screen bg-[#0a0a12] text-white">
      <Suspense fallback={<div className="py-24 text-center text-slate-500">Carregando…</div>}>
        <CadastroForm />
      </Suspense>
    </main>
  );
}
