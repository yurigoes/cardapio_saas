/**
 * GET /api/admin/agentes
 *
 * Lista TODAS as máquinas de TODAS as empresas (master only).
 * Query params:
 *   - empresa_id?: filtra por empresa
 *   - tipo?:       filtra por tipo
 *   - status?:     online | offline | aguardando | desativado
 *   - q?:          busca por nome/hostname
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const url = new URL(req.url);
  const empresaId = url.searchParams.get("empresa_id");
  const tipo      = url.searchParams.get("tipo");
  const status    = url.searchParams.get("status");
  const q         = url.searchParams.get("q");

  const where: string[] = ["a.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (empresaId) { params.push(empresaId); where.push(`a.empresa_id = $${params.length}`); }
  if (tipo)      { params.push(tipo);      where.push(`a.tipo = $${params.length}`); }
  if (status)    { params.push(status);    where.push(`a.status = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(a.nome ILIKE $${params.length} OR a.hostname ILIKE $${params.length})`);
  }

  try {
    const rows = await query(
      `SELECT a.id, a.agente_id, a.tipo, a.nome,
              a.hostname, a.ip_ultimo::text AS ip_ultimo,
              a.plataforma, a.versao,
              a.status, a.ultimo_hb_em, a.registrado_em, a.primeiro_hb_em,
              a.fila_pendente, a.ultimo_pedido_em,
              a.alertado_em, a.alertas_count,
              a.empresa_id,
              e.nome_fantasia AS empresa_nome
         FROM agentes a
         LEFT JOIN empresas e ON e.id = a.empresa_id
        WHERE ${where.join(" AND ")}
        ORDER BY
          CASE a.status
            WHEN 'offline' THEN 1
            WHEN 'aguardando' THEN 2
            WHEN 'online' THEN 3
            ELSE 4
          END,
          a.ultimo_hb_em DESC NULLS LAST
        LIMIT 500`,
      params
    ).catch(() => []);

    // Stats agregadas
    const statsRows = await query<{ status: string; qtd: string }>(
      `SELECT status, COUNT(*)::text AS qtd
         FROM agentes
        WHERE deleted_at IS NULL
        GROUP BY status`
    ).catch(() => []);
    const stats = Object.fromEntries(statsRows.map(s => [s.status, Number(s.qtd)]));

    return ok({ agentes: rows, stats, total: rows.length });
  } catch (err) {
    console.error("[Admin/Agentes/GET]", err);
    return serverError();
  }
}
