"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/Layout";
import Dashboard from "@/components/admin/Dashboard";
import Produtos from "@/components/admin/Produtos";
import Categorias from "@/components/admin/Categorias";
import Adicionais from "@/components/admin/Adicionais";
import Pedidos from "@/components/admin/Pedidos";
import Usuarios from "@/components/admin/Usuarios";
import KdsAdmin from "@/components/admin/KdsAdmin";
import RankingFidelidade from "@/components/admin/RankingFidelidade";
import CuponsFidelidade from "@/components/admin/CuponsFidelidade";
import PersonalizacaoEmpresa from "@/components/admin/PersonalizacaoEmpresa";
import VideosEmpresa from "@/components/admin/VideosEmpresa";
import ConfiguracoesEmpresa from "@/components/admin/ConfiguracoesEmpresa";
import ProtectedAdmin from "@/components/admin/ProtectedAdmin";
import { AdminUser, canAccessModule, firstAllowedModule } from "@/lib/adminModules";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API || "https://connect.yugochat.com.br";

function getInitialTab() {
  if (typeof window === "undefined") return "dashboard";
  const params = new URLSearchParams(window.location.search);
  return params.get("tab") || "dashboard";
}

export default function AdminPage({ params }: any) {
  const [tab, setTab] = useState("dashboard");
  const [empresa, setEmpresa] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function loadEmpresa() {
    try {
      setLoading(true);

      const res = await fetch(
        `${API}/api/db/empresas_cardapio?where=(Id,eq,${params.empresaId})&limit=1`,
        { cache: "no-store" }
      );

      const data = await res.json();
      setEmpresa(data.list?.[0] || null);
    } catch (error) {
      console.error("Erro ao carregar empresa:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setTab(getInitialTab());
    loadEmpresa();

    const handlePopState = () => setTab(getInitialTab());
    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [params.empresaId]);

  function handleChangeTab(nextTab: string, user: AdminUser) {
    if (!canAccessModule(user, nextTab)) {
      setTab(firstAllowedModule(user));
      return;
    }

    setTab(nextTab);

    if (typeof window !== "undefined") {
      window.history.pushState(null, "", `/admin/${params.empresaId}?tab=${nextTab}`);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Carregando painel administrativo...
      </div>
    );
  }

  return (
    <ProtectedAdmin empresaId={params.empresaId} moduleId={tab}>
      {(user) => (
        <AdminLayout
          active={tab}
          onChange={(nextTab) => handleChangeTab(nextTab, user)}
          empresa={empresa}
          user={user}
        >
          {tab === "dashboard" && <Dashboard empresaId={params.empresaId} />}
          {tab === "pedidos" && <Pedidos empresaId={params.empresaId} />}
          {tab === "produtos" && <Produtos empresaId={params.empresaId} />}
          {tab === "categorias" && <Categorias empresaId={params.empresaId} />}
          {tab === "adicionais" && <Adicionais empresaId={params.empresaId} />}
          {tab === "usuarios" && <Usuarios empresaId={params.empresaId} />}
          {tab === "cozinha" && <KdsAdmin empresaId={params.empresaId} />}
          {tab === "ranking" && <RankingFidelidade empresaId={params.empresaId} />}
          {tab === "cupons" && <CuponsFidelidade empresaId={params.empresaId} />}
          {tab === "personalizacao" && (
            <PersonalizacaoEmpresa
              empresaId={params.empresaId}
              empresa={empresa}
              onReloadEmpresa={loadEmpresa}
            />
          )}
          {tab === "videos" && (
            <VideosEmpresa
              empresaId={params.empresaId}
              empresa={empresa}
              onReloadEmpresa={loadEmpresa}
            />
          )}
          {tab === "config" && <ConfiguracoesEmpresa empresaId={params.empresaId} />}
        </AdminLayout>
      )}
    </ProtectedAdmin>
  );
}
