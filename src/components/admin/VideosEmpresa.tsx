"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import MinioUploadField from "@/components/admin/MinioUploadField";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

export default function VideosEmpresa({ empresaId, empresa, onReloadEmpresa }: { empresaId: string; empresa?: any; onReloadEmpresa?: () => void }) {
  const [videoFundo, setVideoFundo] = useState("");
  const [videoCaixa, setVideoCaixa] = useState("");
  const [videoPainel, setVideoPainel] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setVideoFundo(empresa?.video_fundo_url || "");
    setVideoCaixa(empresa?.video_caixa || "");
    setVideoPainel(empresa?.video_painel || "");
  }, [empresa]);

  const slug = empresa?.slug || empresa?.subdominio || empresa?.nome_fantasia || `empresa-${empresaId}`;

  async function salvar(event: FormEvent) {
    event.preventDefault();

    const res = await fetch(`${API}/api/cardapio/admin/empresas/${empresaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa: { video_fundo_url: videoFundo, video_caixa: videoCaixa, video_painel: videoPainel } })
    });

    const data = await res.json();
    if (!res.ok) { setMsg(data?.error || "Erro ao salvar vídeos."); return; }
    setMsg("Vídeos salvos com sucesso.");
    onReloadEmpresa?.();
  }

  return (
    <section className="space-y-6 text-white">
      <header><h1 className="text-3xl font-black">Vídeos</h1><p className="mt-1 text-sm text-zinc-400">Envie vídeos para o MinIO e salve os links públicos na empresa.</p></header>
      {msg && <div className="rounded-2xl bg-white/10 p-4 text-sm text-white">{msg}</div>}
      <form onSubmit={salvar} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <div className="grid gap-5 xl:grid-cols-3">
          <MinioUploadField empresaId={empresaId} slug={slug} tipo="video" label="Vídeo fundo/totem" value={videoFundo} table="empresas_cardapio" recordId={empresaId} field="video_fundo_url" onChange={setVideoFundo} />
          <MinioUploadField empresaId={empresaId} slug={slug} tipo="video" label="Vídeo caixa fechado" value={videoCaixa} table="empresas_cardapio" recordId={empresaId} field="video_caixa" onChange={setVideoCaixa} />
          <MinioUploadField empresaId={empresaId} slug={slug} tipo="video" label="Vídeo painel TV" value={videoPainel} table="empresas_cardapio" recordId={empresaId} field="video_painel" onChange={setVideoPainel} />
        </div>
        <button type="submit" className="mt-6 flex items-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 font-black text-black hover:bg-emerald-300"><Save className="h-4 w-4" />Salvar vídeos</button>
      </form>
    </section>
  );
}
