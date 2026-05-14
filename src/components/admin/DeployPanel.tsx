"use client";

/**
 * Painel de deploy + backups + rollback.
 */
import { useEffect, useState, useCallback } from "react";
import { GitBranch, Loader2, Copy, Check, RotateCcw, Database, Clock } from "lucide-react";
import { confirmar } from "@/components/ui/ConfirmModal";

interface Props {
  agentOnline: boolean;
  exec: (comando: string, params?: Record<string, unknown>) => Promise<unknown>;
}

export function DeployPanel({ agentOnline, exec }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [backups, setBackups] = useState<string[]>([]);
  const [log, setLog] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregarBackups = useCallback(async () => {
    if (!agentOnline) return;
    try {
      const r = await exec("listar_backups");
      if (r && typeof r === "object" && "backups" in r) {
        setBackups((r as { backups: string[] }).backups);
      }
    } catch {}
  }, [agentOnline, exec]);

  useEffect(() => { carregarBackups(); }, [carregarBackups]);

  async function deploy() {
    if (!await confirmar({
      titulo: "Iniciar deploy?",
      mensagem:
        "1. Backup do banco automático\n" +
        "2. Modo manutenção ativado\n" +
        "3. git pull + migrations + rebuild\n" +
        "4. Health check (rollback se falhar)\n" +
        "5. Modo manutenção desligado\n\n" +
        "Tempo médio: 3-8 minutos. Pedidos novos serão bloqueados.",
      okLabel: "Iniciar deploy",
      perigo: true,
    })) return;

    setBusy("deploy");
    setLog("Iniciando deploy...");
    try {
      const r = await exec("deploy");
      if (r && typeof r === "object") {
        if ("ok" in r && (r as { ok: boolean }).ok) {
          const data = r as { ok: boolean; log?: string };
          setLog("✓ Deploy concluído com sucesso!\n\n" + (data.log ?? ""));
        } else {
          const data = r as { erro?: string };
          setLog("✗ Deploy falhou (rollback automático aplicado):\n\n" + (data.erro ?? "?"));
        }
      }
      carregarBackups();
    } finally { setBusy(null); }
  }

  function copiar(s: string) {
    navigator.clipboard.writeText(s).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  if (!agentOnline) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
          <GitBranch className="h-4 w-4" /> Deploy
        </h2>
        <button onClick={deploy} disabled={busy === "deploy"}
          className="flex items-center gap-2 rounded-xl bg-blue-500 hover:bg-blue-400 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy === "deploy"
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Em andamento...</>
            : <>Deploy agora</>}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Pull + build + rollback automático em caso de falha. O webhook
        <code> /api/admin/vps/deploy/webhook </code> dispara isso automaticamente
        quando você fizer push na main (configurar GITHUB_WEBHOOK_SECRET).
      </p>

      {log && (
        <div className="rounded-lg bg-slate-900 p-3 max-h-80 overflow-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400">Saída</span>
            <button onClick={() => copiar(log)}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
              {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all">{log}</pre>
        </div>
      )}

      {backups.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 mt-4">
            <Database className="h-3.5 w-3.5" /> Backups disponíveis
          </h3>
          <div className="rounded-lg bg-slate-900/50 p-3 space-y-1 max-h-48 overflow-auto">
            {backups.map((b, i) => (
              <code key={i} className="block text-xs text-slate-300 font-mono">
                {b}
              </code>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            <Clock className="inline h-3 w-3" /> Mais antigos que 30 dias são removidos automaticamente.
          </p>
        </div>
      )}
    </section>
  );
}
