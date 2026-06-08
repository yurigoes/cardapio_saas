"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Upload, Trash2, Download, Package } from "lucide-react";
import { notify, confirmModal } from "@/components/Notify";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
}

interface ApkInfo { ok: boolean; existe: boolean; size_real: number; size_db: number | null; sha256: string | null; versao: string | null; uploaded_at: string | null; download_url: string | null; }

export function PlayerApkUploader({ token }: { token: string }) {
  const [info, setInfo] = useState<ApkInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [versao, setVersao] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { const r = await aapi(token, "/api/admin/player-apk"); const d = await r.json(); if (d.ok) setInfo(d); } catch {}
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      if (versao) fd.append("versao", versao);
      const r = await fetch("/api/admin/player-apk", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "erro");
      notify(`APK enviado! ${(d.size / 1024 / 1024).toFixed(1)}MB · sha ${d.sha256.slice(0, 12)}...`, "success");
      load();
    } catch (e) { notify((e as Error).message, "error"); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function remover() {
    if (!await confirmModal("Remover o APK hospedado? TVs não vão poder baixar até subir um novo.")) return;
    setBusy(true);
    await aapi(token, "/api/admin/player-apk", { method: "DELETE" });
    setBusy(false);
    notify("APK removido", "success");
    load();
  }

  const fmtSize = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200"><Package className="h-4 w-4" /> Upload do APK direto pro SaaS</p>
      {info?.existe ? (
        <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
          <p className="font-semibold text-emerald-300">✓ APK ativo: {fmtSize(info.size_real)}</p>
          {info.versao && <p className="text-slate-300">Versão: {info.versao}</p>}
          {info.uploaded_at && <p className="text-slate-400">Subido em: {new Date(info.uploaded_at).toLocaleString("pt-BR")}</p>}
          {info.sha256 && <p className="font-mono text-[10px] text-slate-500">sha256: {info.sha256}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <a href="/api/publico/apk" target="_blank" rel="noopener" className="flex items-center gap-1 rounded border border-white/15 px-2 py-1 hover:bg-white/5"><Download className="h-3 w-3" /> Baixar pra testar</a>
            <button onClick={remover} disabled={busy} className="flex items-center gap-1 rounded border border-red-500/30 px-2 py-1 text-red-300 hover:bg-red-500/10 disabled:opacity-50"><Trash2 className="h-3 w-3" /> Remover</button>
          </div>
          <p className="mt-2 text-slate-400">URL pública pra colar nas TVs: <code className="text-brand-light">{typeof window !== "undefined" ? window.location.origin : ""}/api/publico/apk</code></p>
        </div>
      ) : (
        <p className="mb-3 text-xs text-slate-500">Nenhum APK hospedado ainda.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[120px]">
          <label className="mb-1 block text-xs text-slate-400">Versão (opcional)</label>
          <input value={versao} onChange={e => setVersao(e.target.value)} placeholder="R301-self" className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {info?.existe ? "Trocar APK" : "Enviar APK"}
          <input ref={inputRef} type="file" accept=".apk,application/vnd.android.package-archive" className="hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">Máximo 100MB. Arquivo é salvo no diretório <code>APK_DIR</code> (configurável via env, default <code>/apks</code>) e servido publicamente em <code>/api/publico/apk</code>.</p>
    </div>
  );
}
