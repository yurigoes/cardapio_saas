"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, LogIn, ShieldCheck } from "lucide-react";
import { saveAdminSession } from "@/lib/adminAuth";
import { firstAllowedModule } from "@/lib/adminModules";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaId = searchParams.get("empresaId") || "";

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const destinoInicial = useMemo(() => {
    return empresaId ? `/admin/${empresaId}` : "/admin";
  }, [empresaId]);

  async function login(event: FormEvent) {
    event.preventDefault();

    try {
      setLoading(true);
      setErro("");

      const res = await fetch(`${API}/api/cardapio/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          senha,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.user) {
        throw new Error(data?.error || "Email ou senha inválidos.");
      }

      saveAdminSession({
        user: data.user,
        token: data.token || "",
        loggedAt: new Date().toISOString(),
      });

      const userEmpresaId = data.user?.empresa_id || empresaId;
      const initialModule = firstAllowedModule(data.user);

      if (initialModule === "pedidos") {
        router.replace(`/admin/${userEmpresaId}/pedidos`);
        return;
      }

      router.replace(userEmpresaId ? `/admin/${userEmpresaId}` : destinoInicial);
    } catch (error: any) {
      setErro(error?.message || "Erro ao realizar login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-emerald-400 text-black">
            <ShieldCheck className="h-8 w-8" />
          </div>

          <h1 className="text-3xl font-black">Acesso Administrativo</h1>
          <p className="mt-2 text-sm text-white/50">
            Entre com email e senha para acessar o painel da empresa.
          </p>
        </div>

        <form onSubmit={login} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-bold text-white/70">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-emerald-300"
              placeholder="admin@empresa.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-white/70">
              Senha
            </label>
            <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition focus-within:border-emerald-300">
              <Lock className="mr-3 h-4 w-4 text-white/40" />
              <input
                type="password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                required
                className="w-full bg-transparent outline-none"
                placeholder="Digite sua senha"
              />
            </div>
          </div>

          {erro && (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-white">
          Carregando login administrativo...
        </div>
      }
    >
      <AdminLoginContent />
    </Suspense>
  );
}
