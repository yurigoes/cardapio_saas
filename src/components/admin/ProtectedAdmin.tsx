"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, LogOut } from "lucide-react";
import { clearAdminSession, getAdminUser, userCanAccessEmpresa } from "@/lib/adminAuth";
import { AdminUser, canAccessModule } from "@/lib/adminModules";

type Props = {
  empresaId: string | number;
  moduleId: string;
  children: (user: AdminUser) => ReactNode;
};

export default function ProtectedAdmin({ empresaId, moduleId, children }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [blockedReason, setBlockedReason] = useState("");

  useEffect(() => {
    const currentUser = getAdminUser();

    if (!currentUser) {
      router.replace(`/admin/login?empresaId=${empresaId}`);
      return;
    }

    if (!userCanAccessEmpresa(currentUser, empresaId)) {
      setBlockedReason("Seu usuário não tem acesso a esta empresa.");
      setUser(currentUser);
      setChecking(false);
      return;
    }

    if (!canAccessModule(currentUser, moduleId)) {
      setBlockedReason("Seu usuário não tem permissão para acessar este módulo.");
      setUser(currentUser);
      setChecking(false);
      return;
    }

    setUser(currentUser);
    setChecking(false);
  }, [empresaId, moduleId, router]);

  function logout() {
    clearAdminSession();
    router.replace(`/admin/login?empresaId=${empresaId}`);
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Verificando acesso administrativo...
      </div>
    );
  }

  if (blockedReason) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <div className="w-full max-w-lg rounded-[2rem] border border-red-400/20 bg-zinc-950 p-8 shadow-2xl">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-red-500 p-3 text-white">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-2xl font-black">Acesso bloqueado</h1>
              <p className="text-sm text-white/50">{user?.nome || user?.email}</p>
            </div>
          </div>

          <p className="text-white/70">{blockedReason}</p>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => router.replace(`/admin/${empresaId}`)}
              className="rounded-2xl bg-white/10 px-4 py-3 font-black transition hover:bg-white/20"
            >
              Voltar ao admin
            </button>

            <button
              type="button"
              onClick={logout}
              className="flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 font-black text-white transition hover:bg-red-400"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{user ? children(user) : null}</>;
}
