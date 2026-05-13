"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChefHat, Check, ArrowRight, AlertTriangle, Loader2 } from "lucide-react";

interface Plano { id: string; nome: string; preco_mensal: string | number }

function CadastroForm() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const planoIdInicial = searchParams.get("plano");

  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoId, setPlanoId] = useState<string>("");
  const [busy, setBusy]       = useState(false);
  const [erro, setErro]       = useState<string | null>(null);
  const [aceitouTermos, setAceitouTermos] = useState(false);

  const [form, setForm] = useState({
    empresa_nome: "",
    cnpj:         "",
    slug:         "",
    whatsapp:     "",
    email:        "",
    admin_nome:   "",
    admin_senha:  "",
  });

  useEffect(() => {
    fetch("/api/pub/planos")
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setPlanos(d.data);
          // Default: planoIdInicial > destaque > primeiro
          if (planoIdInicial && d.data.find((p: Plano) => p.id === planoIdInicial)) {
            setPlanoId(planoIdInicial);
          } else {
            setPlanoId(d.data[0]?.id ?? "");
          }
        }
      });
  }, [planoIdInicial]);

  function up(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    // Auto-gera slug a partir do nome da empresa
    if (k === "empresa_nome" && !form.slug) {
      const slug = v.toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50);
      setForm(f => ({ ...f, empresa_nome: v, slug }));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!aceitouTermos) {
      setErro("Você precisa concordar com os Termos e a Política de Privacidade pra continuar.");
      return;
    }
    setBusy(true);
    setErro(null);

    try {
      const r = await fetch("/api/auth/cadastro-empresa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, plano_id: planoId }),
      });
      const d = await r.json();
      if (d.success) {
        localStorage.setItem("access_token",  d.data.access_token);
        localStorage.setItem("refresh_token", d.data.refresh_token);
        router.push("/painel");
      } else {
        setErro(d.error?.message ?? d.error ?? "Falha ao criar conta");
      }
    } catch (err) {
      setErro((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/5">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-emerald-400" />
            <span className="font-bold">Cardápio SaaS</span>
          </Link>
          <Link href="/login" className="text-sm text-slate-400 hover:text-white">
            Já tenho conta
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Criar conta</h1>
          <p className="text-slate-400">14 dias grátis · sem cartão</p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {erro && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <Section titulo="Dados da empresa">
            <Field label="Nome do restaurante" required>
              <input value={form.empresa_nome} onChange={e => up("empresa_nome", e.target.value)}
                required minLength={2} placeholder="Ex: Restaurante do João"
                className="input" />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="CNPJ (opcional)">
                <input value={form.cnpj} onChange={e => up("cnpj", e.target.value)}
                  placeholder="00.000.000/0001-00" className="input" />
              </Field>
              <Field label="WhatsApp" required>
                <input value={form.whatsapp} onChange={e => up("whatsapp", e.target.value)}
                  required placeholder="+55 11 99999-9999" className="input" />
              </Field>
            </div>
            <Field label="URL do cardápio" required hint={`Vai ficar: app.tthreedigital.com.br/${form.slug || "..."}`}>
              <input value={form.slug} onChange={e => up("slug", e.target.value.toLowerCase())}
                required pattern="[a-z0-9-]+" placeholder="restaurante-do-joao"
                className="input font-mono" />
            </Field>
          </Section>

          <Section titulo="Sua conta de admin">
            <Field label="Seu nome" required>
              <input value={form.admin_nome} onChange={e => up("admin_nome", e.target.value)}
                required minLength={2} className="input" />
            </Field>
            <Field label="E-mail" required>
              <input type="email" value={form.email} onChange={e => up("email", e.target.value)}
                required className="input" />
            </Field>
            <Field label="Senha" required hint="Mínimo 8 caracteres">
              <input type="password" value={form.admin_senha} onChange={e => up("admin_senha", e.target.value)}
                required minLength={8} className="input" />
            </Field>
          </Section>

          <Section titulo="Plano">
            <div className="grid sm:grid-cols-3 gap-3">
              {planos.map(p => (
                <label key={p.id} className={`cursor-pointer rounded-xl border p-4 transition ${
                  planoId === p.id
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}>
                  <input type="radio" name="plano" checked={planoId === p.id}
                    onChange={() => setPlanoId(p.id)} className="hidden" />
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold">{p.nome}</span>
                    {planoId === p.id && <Check className="h-4 w-4 text-emerald-400" />}
                  </div>
                  <p className="text-sm text-slate-400">
                    R$ {Number(p.preco_mensal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês
                    <br />
                    <span className="text-xs text-emerald-400">14 dias grátis</span>
                  </p>
                </label>
              ))}
            </div>
          </Section>

          <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300 cursor-pointer hover:bg-white/10">
            <input type="checkbox" checked={aceitouTermos}
              onChange={e => setAceitouTermos(e.target.checked)}
              className="mt-0.5 accent-emerald-500" />
            <span>
              Li e concordo com os{" "}
              <Link href="/termos" target="_blank" className="text-emerald-400 underline">Termos de Uso</Link>
              {" "}e a{" "}
              <Link href="/privacidade" target="_blank" className="text-emerald-400 underline">Política de Privacidade</Link>
              {" "}(LGPD).
            </span>
          </label>

          <button type="submit" disabled={busy || !aceitouTermos}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {busy ? "Criando conta..." : "Criar conta grátis"}
          </button>

          <p className="text-xs text-slate-500 text-center">
            14 dias grátis. Cancele a qualquer momento sem custo.
          </p>
        </form>
      </main>

      <style jsx>{`
        .input {
          width: 100%;
          background: rgb(30 41 59);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 0.5rem;
          padding: 0.625rem 0.75rem;
          color: white;
          font-size: 0.875rem;
        }
        .input:focus {
          outline: none;
          border-color: rgba(16,185,129,0.5);
        }
      `}</style>
    </div>
  );
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
      <h2 className="font-bold text-sm uppercase tracking-wider text-slate-300">{titulo}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-400 mb-1 block">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      {children}
      {hint && <span className="text-[10px] text-slate-500 block mt-1">{hint}</span>}
    </label>
  );
}

export default function CadastroPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Carregando...</div>}>
      <CadastroForm />
    </Suspense>
  );
}
