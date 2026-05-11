"use client";

import { ChangeEvent, useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, Upload, Video, X } from "lucide-react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type UploadTipo = "produto" | "logo" | "banner" | "video" | "imagem";

type Props = {
  empresaId: string | number;
  slug?: string;
  tipo?: UploadTipo;
  label?: string;
  value?: string;
  table?: string;
  recordId?: string | number;
  field?: string;
  accept?: string;
  onChange: (url: string) => void;
};

function isVideoUrl(url?: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(String(url || ""));
}

export default function MinioUploadField({
  empresaId,
  slug,
  tipo = "imagem",
  label = "Arquivo",
  value = "",
  table = "",
  recordId = "",
  field = "",
  accept,
  onChange
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"upload" | "link">(value ? "link" : "upload");
  const [manualUrl, setManualUrl] = useState(value || "");

  const finalAccept =
    accept ||
    (tipo === "video"
      ? "video/mp4,video/webm,video/quicktime"
      : "image/png,image/jpeg,image/webp,image/gif,image/svg+xml");

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError("");

      const form = new FormData();
      form.append("file", file);
      form.append("empresa_id", String(empresaId || ""));
      form.append("slug", slug || "");
      form.append("tipo", tipo);
      form.append("table", table || "");
      form.append("record_id", String(recordId || ""));
      form.append("field", field || "");

      const res = await fetch(`${API}/api/cardapio/admin/minio/upload`, {
        method: "POST",
        body: form
      });

      const data = await res.json();

      if (!res.ok || !data?.url) {
        throw new Error(data?.details ? `${data?.error || "Erro ao enviar arquivo."} ${JSON.stringify(data.details)}` : data?.error || "Erro ao enviar arquivo.");
      }

      setManualUrl(data.url);
      onChange(data.url);
    } catch (err: any) {
      setError(err?.message || "Erro ao enviar arquivo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function aplicarLink() {
    const url = manualUrl.trim();
    setError("");

    if (!url) {
      onChange("");
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      setError("Informe um link válido começando com http ou https.");
      return;
    }

    onChange(url);
  }

  function limpar() {
    setManualUrl("");
    setError("");
    onChange("");
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white">{label}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Escolha enviar para o MinIO ou inserir um link manualmente.
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-black/30 p-1">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-black transition ${mode === "upload" ? "bg-emerald-400 text-black" : "text-white/70 hover:bg-white/10"}`}
        >
          <Upload className="h-4 w-4" />
          Subir imagem
        </button>

        <button
          type="button"
          onClick={() => setMode("link")}
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-black transition ${mode === "link" ? "bg-emerald-400 text-black" : "text-white/70 hover:bg-white/10"}`}
        >
          <Link2 className="h-4 w-4" />
          Inserir link
        </button>
      </div>

      {mode === "upload" ? (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-black transition hover:bg-emerald-300 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Enviando..." : "Selecionar e enviar arquivo"}
          </button>

          <input ref={inputRef} type="file" accept={finalAccept} onChange={handleFile} className="hidden" />
        </>
      ) : (
        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value)}
            onBlur={aplicarLink}
            placeholder="https://s3.yugochat.com.br/empresa/imagem.jpg"
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-300"
          />
          <button
            type="button"
            onClick={aplicarLink}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-zinc-200"
          >
            Usar link
          </button>
        </div>
      )}

      {value ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {isVideoUrl(value) || tipo === "video" ? (
            <video src={value} controls className="max-h-56 w-full bg-black object-contain" />
          ) : (
            <img src={value} alt={label} className="max-h-56 w-full bg-black object-contain p-2" />
          )}

          <div className="flex items-center justify-between gap-3 border-t border-white/10 p-3">
            <a href={value} target="_blank" className="truncate text-xs text-emerald-300 underline">
              {value}
            </a>

            <button type="button" onClick={limpar} className="rounded-xl bg-red-500/10 p-2 text-red-300 transition hover:bg-red-500/20">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (mode === "upload" ? inputRef.current?.click() : undefined)}
          className="flex min-h-36 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-zinc-500 transition hover:border-emerald-400/50 hover:text-emerald-300"
        >
          {tipo === "video" ? <Video className="h-8 w-8" /> : <ImagePlus className="h-8 w-8" />}
          {mode === "upload" ? `Clique para enviar ${tipo === "video" ? "vídeo" : "imagem"}` : "Insira o link acima"}
        </button>
      )}

      {error && <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
    </div>
  );
}
