/**
 * GET /api/admin/retaguardas — lista todas retaguardas registradas (master)
 *
 * Retorna: id, slug, dominio, IP, último heartbeat, status (online/offline),
 *          tempo desde último heartbeat.
 *
 * Considera "online" se ultimo_heartbeat < 3 minutos atrás (3× o intervalo).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { ok, forbidden } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") {
    return forbidden("Acesso exclusivo master");
  }

  const rows = await query<{
    id: string; retaguarda_id: string;
    empresa_slug: string; dominio: string | null;
    ip_publico: string | null; versao: string | null;
    primeira_vez: string; ultimo_heartbeat: string;
    metricas: Record<string, unknown>;
    segundos_desde: number;
  }>(
    `SELECT id, retaguarda_id, empresa_slug, dominio, ip_publico::text AS ip_publico,
            versao, primeira_vez, ultimo_heartbeat, metricas,
            EXTRACT(EPOCH FROM (NOW() - ultimo_heartbeat))::int AS segundos_desde
       FROM retaguardas
      WHERE ativo = TRUE
      ORDER BY ultimo_heartbeat DESC`
  ).catch(() => []);

  return ok(rows.map(r => ({
    ...r,
    online:        r.segundos_desde < 180,
    label_status:  r.segundos_desde < 90  ? "online"
                 : r.segundos_desde < 180 ? "instavel"
                 : "offline",
  })));
}
