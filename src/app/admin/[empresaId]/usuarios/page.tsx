"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/Layout";
import Usuarios from "@/components/admin/Usuarios";
import ProtectedAdmin from "@/components/admin/ProtectedAdmin";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API || "https://connect.yugochat.com.br";

export default function AdminUsuariosPage({ params }: any) {
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
    loadEmpresa();
  }, [params.empresaId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Carregando contas admin...
      </div>
    );
  }

  return (
    <ProtectedAdmin empresaId={params.empresaId} moduleId="usuarios">
      {(user) => (
        <AdminLayout active="usuarios" onChange={() => {}} empresa={empresa} user={user}>
          <Usuarios empresaId={params.empresaId} />
        </AdminLayout>
      )}
    </ProtectedAdmin>
  );
}
