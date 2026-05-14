"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Logs = página de Erros (já existe e tem a UI completa)
export default function AdminLogsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/erros"); }, [router]);
  return <div className="p-8 text-slate-400">Redirecionando para /admin/erros…</div>;
}
