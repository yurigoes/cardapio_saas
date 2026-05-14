"use client";

/**
 * /recuperar-senha — fluxo de recuperação multi-canal.
 *
 * Step 1: usuário entra com email ou telefone + escolhe canal
 * Step 2: insere código de 6 dígitos + nova senha
 */
import { useState, FormEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, MessageCircle, KeyRound, Check, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { useSaasBranding } from "@/lib/hooks/useSaasBranding";

export default function RecuperarSenhaPage() {
  const branding = useSaasBranding();
  const [step, setStep] = useState<1 | 2>(1);
  const [identificador, setIdentificador] = useState("");
  const [canal,         setCanal]         = useState<"email" | "whatsapp">("email");
  const [codigo,        setCodigo]        = useState("");
  const [novaSenha,     setNovaSenha]     = useState("");
  const [mostrarSenha,  setMostrarSenha]  = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [erro,          setErro]          = useState<string | null>(null);
  const [destinoMascarado, setDestinoMascarado] = useState<string | null>(null);

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identificador, canal }),
      });
      const d = await r.json();
      if (!d.success) {
        setErro(d.error?.message ?? "Falha ao enviar código");
        return;
      }
      setDestinoMascarado(d.data?.destino_mascarado ?? null);
      setStep(2);
    } finally { setLoading(false); }
  }

  async function redefinir(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/redefinir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identificador, codigo, nova_senha: novaSenha }),
      });
      const d = await r.json();
      if (!d.success) {
        setErro(d.error?.message ?? "Falha ao redefinir senha");
        return;
      }
      // Sucesso: redireciona pra login
      window.location.href = "/login?redefinido=1";
    } finally { setLoading(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="mb-6 text-center">
          {branding.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logo_url}
              alt={branding.nome}
              className="mx-auto h-16 w-auto max-w-[220px] object-contain"
            />
          ) : (
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20">
              <KeyRound className="h-7 w-7 text-emerald-400" />
            </div>
          )}
          <h1 className="mt-3 text-2xl font-bold text-white">Recuperar senha</h1>
          <p className="mt-1 text-sm text-slate-400">
            {step === 1
              ? "Te mandamos um código pra redefinir."
              : `Código enviado pra ${destinoMascarado ?? "seu contato"}`}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
          {erro && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {erro}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={pedirCodigo} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  E-mail ou telefone
                </label>
                <input
                  type="text"
                  value={identificador}
                  onChange={e => setIdentificador(e.target.value)}
                  required
                  placeholder="seu@email.com ou 11999999999"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-emerald-500/50"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Onde quer receber o código?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 transition ${
                    canal === "email" ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 bg-white/5"
                  }`}>
                    <input type="radio" name="canal" value="email"
                      checked={canal === "email"}
                      onChange={() => setCanal("email")}
                      className="accent-emerald-500" />
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span className="text-sm text-white">E-mail</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 transition ${
                    canal === "whatsapp" ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 bg-white/5"
                  }`}>
                    <input type="radio" name="canal" value="whatsapp"
                      checked={canal === "whatsapp"}
                      onChange={() => setCanal("whatsapp")}
                      className="accent-emerald-500" />
                    <MessageCircle className="h-4 w-4 text-slate-400" />
                    <span className="text-sm text-white">WhatsApp</span>
                  </label>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  Se o canal escolhido não estiver disponível pra sua conta, tentamos o outro.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !identificador.trim()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {loading ? "Enviando..." : "Enviar código"}
              </button>
            </form>
          ) : (
            <form onSubmit={redefinir} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Código de 6 dígitos
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={codigo}
                  onChange={e => setCodigo(e.target.value.replace(/\D/g, ""))}
                  required
                  placeholder="000000"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-2xl font-mono font-bold tracking-[0.5em] text-white outline-none transition focus:border-emerald-500/50"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Nova senha (mínimo 8 caracteres)
                </label>
                <div className="relative">
                  <input
                    type={mostrarSenha ? "text" : "password"}
                    value={novaSenha}
                    onChange={e => setNovaSenha(e.target.value)}
                    required minLength={8}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-white outline-none transition focus:border-emerald-500/50"
                  />
                  <button type="button"
                    onClick={() => setMostrarSenha(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                    {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || codigo.length !== 6 || novaSenha.length < 8}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {loading ? "Salvando..." : "Redefinir senha"}
              </button>

              <button type="button"
                onClick={() => { setStep(1); setCodigo(""); }}
                className="flex w-full items-center justify-center gap-1 text-xs text-slate-400 hover:text-white">
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Lembrou a senha?{" "}
          <Link href="/login" className="text-emerald-400 hover:underline">
            Voltar pro login
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
