#!/usr/bin/env -S npx tsx
/**
 * scripts/recomprimir-imagens.ts
 *
 * Re-comprime imagens já enviadas para MinIO, convertendo PNG/JPEG para WebP
 * e reduzindo tamanho. Útil para empresas migradas de uma versão sem
 * compressão automática.
 *
 * Uso:
 *   npx tsx scripts/recomprimir-imagens.ts                 # dry-run global
 *   npx tsx scripts/recomprimir-imagens.ts --apply         # commit changes
 *   npx tsx scripts/recomprimir-imagens.ts --empresa <id>  # filtra empresa
 *   npx tsx scripts/recomprimir-imagens.ts --apply --limit 50
 */
import { recomprimirTudo } from "../src/lib/media/recompress";

function fmtBytes(n: number): string {
  if (n < 1024)        return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const args      = process.argv.slice(2);
  const apply     = args.includes("--apply");
  const empresaIx = args.indexOf("--empresa");
  const limitIx   = args.indexOf("--limit");
  const empresaId = empresaIx >= 0 ? args[empresaIx + 1] : undefined;
  const limit     = limitIx   >= 0 ? Number(args[limitIx + 1]) : undefined;

  console.log("");
  console.log(`  Re-compressão de imagens — modo ${apply ? "APPLY ⚠️" : "DRY-RUN (use --apply)"}`);
  if (empresaId) console.log(`  Empresa: ${empresaId}`);
  if (limit)     console.log(`  Limite: ${limit}`);
  console.log("");

  const t0 = Date.now();
  const r  = await recomprimirTudo({ dryRun: !apply, empresaId, limit });

  for (const item of r.itens) {
    const tag =
      item.status === "ok"      ? "✓ OK     " :
      item.status === "skipped" ? "· skip   " :
                                  "✗ ERROR  ";
    const tail = item.status === "ok"
      ? `  ${fmtBytes(item.size_antes ?? 0)} → ${fmtBytes(item.size_depois ?? 0)}`
      : item.reason ? `  (${item.reason})` : "";
    console.log(`  ${tag} ${item.table}.${item.column} ${item.id.slice(0, 8)}…${tail}`);
  }

  console.log("");
  console.log(`  Total:    ${r.total}`);
  console.log(`  OK:       ${r.ok}`);
  console.log(`  Skipped:  ${r.skipped}`);
  console.log(`  Erros:    ${r.error}`);
  if (r.bytes_antes > 0) {
    const economia = r.bytes_antes - r.bytes_depois;
    const pct      = Math.round((1 - r.bytes_depois / r.bytes_antes) * 100);
    console.log(`  Antes:    ${fmtBytes(r.bytes_antes)}`);
    console.log(`  Depois:   ${fmtBytes(r.bytes_depois)}`);
    console.log(`  Economia: ${fmtBytes(economia)} (${pct}%)`);
  }
  console.log(`  Tempo:    ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("");

  if (!apply) {
    console.log("  Nada foi alterado. Para aplicar, rode com --apply");
    console.log("");
  }

  process.exit(r.error > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Falha geral:", err);
  process.exit(2);
});
