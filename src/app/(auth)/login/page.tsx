"use client";

import { useState, FormEvent } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, Mail, ChefHat } from "lucide-react";

export default function LoginPage() {
  const [email,    setEmail]    = useState("");
  const [senha,    setSenha]    = useState("");
  const [mostrar,  setMostrar]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [erro,     setErro]     = useState<string | null>(null);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, senha }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        // Modo manutenção: 503 com code MANUTENCAO
        if (res.status === 503 && data.code === "MANUTENCAO") {
          const { alertar } = await import("@/components/ui/ConfirmModal");
          await alertar({
            titulo:   "🔧 Sistema em manutenção",
            mensagem: data.error + "\n\nApenas administradores master conseguem acessar agora. Tente novamente em alguns minutos.",
            tipo:     "alerta",
          });
          setErro("Sistema em manutenção — acesso bloqueado");
          return;
        }
        setErro(data.error || "Erro ao fazer login");
        return;
      }

      // Armazena tokens
      localStorage.setItem("access_token",  data.data.access_token);
      localStorage.setItem("refresh_token", data.data.refresh_token);

      // Redireciona baseado no role
      const role: string = data.data.usuario.role;

      const redirectMap: Record<string, string> = {
        master:     "/hub",
        admin:      "/hub",
        gerente:    "/hub",
        garcom:     "/hub",
        cozinha:    "/hub",
        financeiro: "/hub",
        delivery:   "/hub",
        atendente:  "/hub",
        motoboy:    "/hub",
      };

      window.location.href = redirectMap[role] || "/painel";
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-500/40">
            <ChefHat className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">
            Cardápio SaaS
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Sistema de gestão para restaurantes
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
          <h2 className="mb-6 text-xl font-semibold text-white">
            Entrar na conta
          </h2>

          {erro && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            >
              {erro}
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* E-mail */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="seu@email.com"
                  autoComplete="email"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder-slate-500 outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            {/* Senha */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type={mostrar ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-12 text-white placeholder-slate-500 outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
                />
                <button
                  type="button"
                  onClick={() => setMostrar((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                >
                  {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Cardápio SaaS © {new Date().getFullYear()} — Todos os direitos reservados
        </p>
      </motion.div>
    </main>
  );
}
