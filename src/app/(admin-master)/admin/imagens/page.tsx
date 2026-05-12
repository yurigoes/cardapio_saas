"use client";

/**
 * /admin/imagens — re-compressão em lote (master)
 *
 * Roda dry-run primeiro pra mostrar quanto vai economizar.
 * Apply efetivamente recomprime + faz UPDATE nos URLs.
 */
import { useState } from "react";
import { Image as ImageIcon, PlayCircle, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

interface Resultado {
  dryRun:  boolean;
  total:   number;
  ok:      number;
  skipped: number;
  error:   number;
  bytes_antes:  number;
  bytes_depois: number;
  economia_pct: number;
  itens: Array<{
    table: string; column: string; id: string;
    status: "ok" | "skipped" | "error";
    reason?: string;
    size_antes?: number; size_depois?: number;
  }>;
}

function fmtBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024)        return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AdminImagensPage() {
  const [empresaId, setEmpresaId] = useState("");
  const [limit, setLimit]         = useState(100);
  const [data, setData]           = useState<Resultado | null>(null);
  const [loading, setLoading]     = useState(false);

  async function rodar(dryRun: boolean) {
    if (!dryRun && !confirm(
      "APLICAR re-compressão?\n\nIsso irá:\n" +
      "• converter PNG/JPEG para WebP\n" +
      "• atualizar URLs no banco\n" +
      "• manter arquivos originais no MinIO\n\n" +
      "Operação não-destrutiva mas irreversível sem rollback manual."
    )) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("/api/admin/imagens/recomprimir", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          dryRun,
          ...(empresaId ? { empresaId } : {}),
          limit,
        }),
      });
      const j = await res.json();
      if (j.success) setData(j.data);
      else alert(j.error?.message ?? "Falha");
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <ImageIcon className="h-5 w-5 text-emerald-400" />
          Re-compressão de imagens
        </h1>
        <p className="mt-0.5 text-sm text-slate-400">
          Converte imagens antigas (PNG/JPEG) para WebP. Reduz banda e melhora LCP nos cardápios.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Empresa (UUID, opcional)</label>
            <input
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              placeholder="vazio = todas"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Limite (1-500)</label>
            <input
              type="number" min={1} max={500} value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => rodar(true)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" />
            Dry-run (não altera nada)
          </button>
          <button
            onClick={() => rodar(false)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Aplicar de verdade
          </button>
        </div>

        <div className="text-[11px] text-slate-500 flex items-start gap-2 pt-1">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
          <span>
            Para grandes volumes, use o script via SSH:
            <code className="ml-1 px-1.5 py-0.5 rounded bg-slate-800 font-mono text-emerald-300">
              docker exec -it cardapio_app npx tsx scripts/recomprimir-imagens.ts --apply
            </code>
          </span>
        </div>
      </div>

      {/* Resultado */}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total",   v: data.total,   color: "text-white" },
              { label: "OK",      v: data.ok,      color: "text-emerald-400" },
              { label: "Skipped", v: data.skipped, color: "text-slate-400" },
              { label: "Erros",   v: data.error,   color: "text-red-400" },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
                <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.v}</p>
              </div>
            ))}
          </div>

          {data.bytes_antes > 0 && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <p className="text-xs uppercase tracking-wider text-emerald-400">
                {data.dryRun ? "Economia projetada" : "Economia aplicada"}
              </p>
              <p className="mt-2 text-3xl font-bold text-white">
                {fmtBytes(data.bytes_antes - data.bytes_depois)}{" "}
                <span className="text-base font-normal text-emerald-400">({data.economia_pct}%)</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {fmtBytes(data.bytes_antes)} → {fmtBytes(data.bytes_depois)}
              </p>
            </div>
          )}

          {/* Lista */}
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="divide-y divide-white/5 max-h-96 overflow-auto">
              {data.itens.map((it, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={
                      it.status === "ok"      ? "text-emerald-400" :
                      it.status === "skipped" ? "text-slate-500" :
                                                "text-red-400"
                    }>
                      {it.status === "ok" ? "✓" : it.status === "skipped" ? "·" : "✗"}
                    </span>
                    <span className="text-slate-300 font-mono">{it.table}.{it.column}</span>
                    <span className="text-slate-600 font-mono">{it.id.slice(0, 8)}</span>
                    {it.reason && <span className="text-slate-500 truncate">{it.reason}</span>}
                  </div>
                  {it.size_antes && (
                    <span className="text-slate-500 font-mono whitespace-nowrap">
                      {fmtBytes(it.size_antes)} → {fmtBytes(it.size_depois ?? 0)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
