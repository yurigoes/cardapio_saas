/**
 * GET /api/painel/auditoria
 *   ?page=1&limit=50&acao=&recurso=&usuario_id=&from=&to=
 *
 * Lista de eventos de auditoria da empresa, mais recentes primeiro.
 * Acesso restrito a admin/gerente.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryCount } from "@/lib/db/client";
import { forbidden, serverError, paginatedOk } from "@/lib/utils/response";

const ROLES_ALLOWED = ["master", "admin", "gerente"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!ROLES_ALLOWED.includes(role)) return forbidden("Apenas administradores podem ver auditoria");

  const sp     = req.nextUrl.searchParams;
  const page   = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit  = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const acao   = sp.get("acao");
  const recurso = sp.get("recurso");
  const usuarioId = sp.get("usuario_id");
  const from   = sp.get("from");
  const to     = sp.get("to");
  const offset = (page - 1) * limit;

  const conds: string[] = ["a.empresa_id = $1"];
  const vals: unknown[] = [empresaId];
  let idx = 2;

  if (acao)      { conds.push(`a.acao ILIKE $${idx++}`); vals.push(`%${acao}%`); }
  if (recurso)   { conds.push(`a.recurso = $${idx++}`);  vals.push(recurso); }
  if (usuarioId) { conds.push(`a.usuario_id = $${idx++}::uuid`); vals.push(usuarioId); }
  if (from)      { conds.push(`a.created_at >= $${idx++}::date`); vals.push(from); }
  if (to)        { conds.push(`a.created_at < ($${idx++}::date + INTERVAL '1 day')`); vals.push(to); }

  const where = conds.join(" AND ");

  try {
    const [rows, total] = await Promise.all([
      query<{
        id:               string;
        acao:             string;
        recurso:          string | null;
        recurso_id:       string | null;
        dados_anteriores: Record<string, unknown> | null;
        dados_novos:      Record<string, unknown> | null;
        ip_address:       string | null;
        duracao_ms:       number | null;
        created_at:       string;
        usuario_id:       string | null;
        usuario_nome:     string | null;
      }>(
        `SELECT a.id, a.acao, a.recurso, a.recurso_id,
                a.dados_anteriores, a.dados_novos,
                a.ip_address::text AS ip_address, a.duracao_ms,
                a.created_at,
                a.usuario_id, u.nome AS usuario_nome
         FROM audit_log a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         WHERE ${where}
         ORDER BY a.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...vals, limit, offset]
      ),
      queryCount(`SELECT COUNT(*) FROM audit_log a WHERE ${where}`, vals),
    ]);

    return paginatedOk(rows, total, page, limit);
  } catch (err) {
    console.error("[Auditoria/GET]", err);
    return serverError();
  }
}
