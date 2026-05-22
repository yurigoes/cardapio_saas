"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Tv, Check, ArrowLeft, Loader2 } from "lucide-react";
import { PLANOS as STATIC_PLANOS, formatBRL, type Plano } from "@/lib/planos";

function CadastroForm() {
  const sp = useSearchParams();
  const planoInicial = sp.get("plano") ?? "profissional";

  const [PLANOS, setPlanos]     = useState<Plano[]>(STATIC_PLANOS);
  const [plano,    setPlano]    = useState(planoInicial);

  // Carrega planos atuais do banco (gerenciados pelo master)
  useEffect(() => {
    fetch("/api/planos").then(r => r.json()).then(d => {
      if (d.ok && Array.isArray(d.planos) && d.planos.length) setPlanos(d.planos);
    }).catch(() => { /* mantém static */ });
  }, []);
  const [nome,     setNome]     = useState("");
  const [empresa,  setEmpresa]  = useState("");
  const [email,    setEmail]    = useState("");
  const [senha,    setSenha]    = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telas,    setTelas]    = useState("1");
  const [cidade,   setCidade]   = useState("");
  const [busy,     setBusy]     = useState(false);
  const [etapa,    setEtapa]    = useState("");
  const [err,      setErr]      = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      // 1) Cria a conta + assinatura (pendente) e recebe o JWT
      setEtapa("Criando sua conta…");
      const rs = await fetch("/api/auth/signup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          nome, empresa, email, senha, whatsapp, cidade,
          plano, qtd_telas: Number(telas) || 1,
        }),
      });
      const ds = await rs.json();
      if (!ds.ok) { setErr(ds.error || "Erro ao criar conta"); return; }

      // Guarda o token pra área do cliente
      localStorage.setItem("midia_token", ds.token);

      // 2) Cria o pagamento recorrente no Mercado Pago
      setEtapa("Gerando link de pagamento…");
      const rp = await fetch("/api/pagamento/criar", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ds.token}` },
      });
      const dp = await rp.json();
      if (!dp.ok || !dp.init_point) { setErr(dp.error || "Erro ao gerar pagamento"); return; }

      // 3) Redireciona pro checkout do Mercado Pago
      setEtapa("Redirecionando pro pagamento…");
      window.location.href = dp.init_point;
    } catch {
      setErr("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const planoSel = PLANOS.find(p => p.id === plano);
  const totalMensal = planoSel ? planoSel.preco * (Number(telas) || 1) : 0;

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
          <Field label="Senha *"        value={senha}    onChange={setSenha}    placeholder="mínimo 6 caracteres" type="password" required />
          <Field label="WhatsApp"       value={whatsapp} onChange={setWhatsapp} placeholder="(11) 99999-9999" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qtde de telas" value={telas}  onChange={setTelas}  placeholder="1" type="number" />
            <Field label="Cidade"        value={cidade} onChange={setCidade} placeholder="São Paulo" />
          </div>

          {err && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{err}</p>}

          <button type="submit" disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold hover:bg-brand-dark disabled:opacity-50 transition">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? (etapa || "Processando…") : "Criar conta e pagar"}
          </button>
          <p className="text-center text-xs text-slate-500">
            Já tem conta? <Link href="/painel" className="text-brand-light hover:underline">Entrar na área do cliente</Link>
          </p>
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
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>{telas || 1} tela{Number(telas) > 1 ? "s" : ""} × {planoSel ? formatBRL(planoSel.preco) : "—"}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm text-slate-300">Total mensal</span>
            <span className="text-2xl font-black text-brand-light">{formatBRL(totalMensal)}</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Cobrança recorrente mensal via Mercado Pago. Cancele quando quiser.</p>
        </div>
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
