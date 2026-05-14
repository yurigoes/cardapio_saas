/**
 * GET /api/admin/email/logs?status=&evento=&page=
 *
 * Lista jobs de e-mail (pendente, enviando, enviado, erro).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const url    = new URL(req.url);
  const status = url.searchParams.get("status");
  const evento = url.searchParams.get("evento");
  const page   = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit  = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 30)));
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: unknown[] = [];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (evento) { params.push(evento); where.push(`evento = $${params.length}`); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    params.push(limit, offset);
    const rows = await query(
      `SELECT id, para, assunto, evento, status, tentativas, max_tentativas,
              proximo_em, enviado_em, erro, message_id, created_at
         FROM email_jobs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = await queryOne<{ qtd: string }>(
      `SELECT COUNT(*) AS qtd FROM email_jobs ${whereClause}`,
      params.slice(0, -2)
    );

    return ok({
      logs:  rows,
      page,
      limit,
      total: Number(total?.qtd ?? 0),
    });
  } catch (err) {
    console.error("[Email/Logs]", err);
    return serverError();
  }
}
