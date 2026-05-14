"use client";

/**
 * BackupR2Panel — disparo manual de backup pra Cloudflare R2.
 *
 * Mostra status (config OK / não configurado) e botão "Rodar agora".
 * O cron diário já roda via systemd/cron — esse painel é pra disparo
 * pontual e visibilidade.
 */
import { useEffect, useState, useCallback } from "react";
import { Cloud, Play, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface CheckResult {
  ok: boolean;
  mensagem?: string;
  remote?: string;
  bucket?: string;
  path?: string;
  retencao_dias?: number;
  erro?: string;
}

interface BackupResult {
  ok: boolean;
  arquivo?: string;
  tamanho_mb?: number | string;
  upload_ms?: number;
  retencao_dias?: number;
  erro?: string;
}

type Exec = (
  comando: string,
  params?: Record<string, unknown>
) => Promise<unknown>;

export function BackupR2Panel({
  agentOnline,
  exec,
}: {
  agentOnline: boolean;
  exec: Exec;
}) {
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState<"check" | "run" | null>(null);
  const [resultado, setResultado] = useState<BackupResult | null>(null);

  const verificar = useCallback(async () => {
    if (!agentOnline) return;
    setBusy("check");
    try {
      const r = (await exec("backup_to_r2_check", {})) as CheckResult | null;
      setCheck(r);
    } finally {
      setBusy(null);
    }
  }, [agentOnline, exec]);

  useEffect(() => { verificar(); }, [verificar]);

  async function rodar() {
    if (!agentOnline) return;
    setBusy("run");
    setResultado(null);
    try {
      const r = (await exec("backup_to_r2", {})) as BackupResult | null;
      setResultado(r);
    } finally {
      setBusy(null);
    }
  }

  const configOk = check?.ok === true;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
          <Cloud className="h-4 w-4" /> Backup pra Cloudflare R2 (DR)
          {configOk
            ? <span className="text-emerald-400 text-xs">● configurado</span>
            : check && <span className="text-amber-400 text-xs">● não configurado</span>}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={verificar}
            disabled={!agentOnline || busy !== null}
            className="rounded-xl border border-white/10 hover:bg-white/5 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
          >
            Reverificar
          </button>
          <button
            onClick={rodar}
            disabled={!agentOnline || !configOk || busy !== null}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {busy === "run" ? "Rodando..." : "Rodar backup agora"}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Cron diário às 03:00 UTC roda automaticamente (depois de instalar via{" "}
        <code className="text-slate-400">scripts/install-backup-cron.sh</code>).
        Esse botão dispara pontualmente pra teste ou backup imediato.
      </p>

      {/* Status da config */}
      {check && configOk && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Config OK
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300 mt-2">
            <div>Remote: <code className="text-emerald-300">{check.remote}</code></div>
            <div>Bucket: <code className="text-emerald-300">{check.bucket}</code></div>
            <div>Path: <code className="text-emerald-300">{check.path}</code></div>
            <div>Retenção: <code className="text-emerald-300">{check.retencao_dias}d</code></div>
          </div>
        </div>
      )}

      {check && !configOk && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertTriangle className="h-4 w-4" /> Não configurado
          </div>
          <p className="text-slate-300">{check.erro ?? "Config R2 não encontrada."}</p>
          <p className="text-slate-400">
            Setup na VPS:{" "}
            <code className="text-slate-300">apt install rclone</code> →{" "}
            <code className="text-slate-300">rclone config</code> (criar remote &quot;r2&quot;) →
            preencher <code className="text-slate-300">BACKUP_R2_BUCKET</code> no{" "}
            <code className="text-slate-300">.env</code>. Veja{" "}
            <code className="text-slate-300">BACKUP_R2.md</code> pra passo-a-passo.
          </p>
        </div>
      )}

      {/* Resultado da última execução */}
      {resultado && resultado.ok && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Backup enviado
          </div>
          <p className="text-slate-300 break-all">
            Arquivo: <code className="text-emerald-300">{resultado.arquivo}</code>
          </p>
          <p className="text-slate-300">
            Tamanho: <strong>{resultado.tamanho_mb} MB</strong> ·
            Upload em <strong>{((resultado.upload_ms ?? 0) / 1000).toFixed(1)}s</strong>
          </p>
        </div>
      )}

      {resultado && !resultado.ok && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-red-300">
            <AlertTriangle className="h-4 w-4" /> Backup falhou
          </div>
          <p className="text-slate-300 break-words">{resultado.erro ?? "?"}</p>
        </div>
      )}
    </section>
  );
}
