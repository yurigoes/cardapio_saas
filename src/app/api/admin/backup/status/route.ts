/**
 * GET /api/admin/backup/status
 *
 * Master only. Lista últimos backups locais (em /opt/cardapio_saas/backups)
 * + indica se cron está ativo + se BACKUP_R2_BUCKET está configurado.
 */
import { NextRequest } from "next/server";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, forbidden, serverError } from "@/lib/utils/response";

const BACKUP_DIR = "/opt/cardapio_saas/backups";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    const r2Configurado = !!(process.env.BACKUP_R2_BUCKET && process.env.BACKUP_R2_REMOTE);

    let backups: Array<{ nome: string; tamanho: number; idade_horas: number }> = [];
    try {
      const arquivos = await readdir(BACKUP_DIR);
      const detalhes = await Promise.all(
        arquivos
          .filter(f => f.endsWith(".sql.gz"))
          .map(async f => {
            const st = await stat(join(BACKUP_DIR, f));
            return {
              nome:        f,
              tamanho:     st.size,
              idade_horas: Math.round((Date.now() - st.mtimeMs) / 3600_000),
            };
          })
      );
      backups = detalhes.sort((a, b) => a.idade_horas - b.idade_horas).slice(0, 20);
    } catch {/* dir não existe */}

    const ultimoBackup = backups[0] ?? null;
    const status = !ultimoBackup ? "nunca" :
                   ultimoBackup.idade_horas <= 25 ? "ok" :
                   ultimoBackup.idade_horas <= 48 ? "atrasado" :
                   "critico";

    return ok({
      r2_configurado: r2Configurado,
      r2_bucket:      process.env.BACKUP_R2_BUCKET ?? null,
      backup_dir:     BACKUP_DIR,
      ultimo_backup:  ultimoBackup,
      status,
      backups_locais: backups,
      total_backups:  backups.length,
      info: !r2Configurado
        ? "Configure BACKUP_R2_BUCKET no .env e rode bash scripts/install-backup-cron.sh"
        : !ultimoBackup
        ? "Backup nunca rodou. Rode: bash scripts/backup-to-r2.sh"
        : "OK",
    });
  } catch (err) {
    console.error("[Backup/status]", err);
    return serverError();
  }
}
