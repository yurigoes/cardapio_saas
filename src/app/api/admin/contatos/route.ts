/**
 * GET /api/admin/contatos?status=  — lista contatos
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "suporte"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  const status = req.nextUrl.searchParams.get("status");

  try {
    const where: string[] = ["1=1"];
    const vals: unknown[] = [];
    let i = 1;
    if (status) { where.push(`status = $${i++}`); vals.push(status); }

    const rows = await query(
      `SELECT id, nome, email, telefone, empresa, mensagem,
              ip::text AS ip, status, respondido_em, resposta_texto,
              observacoes, created_at
         FROM contatos_institucional
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT 500`,
      vals
    );

    // Conta por status pra dashboard
    const totais = await query<{ status: string; n: string }>(
      `SELECT status, COUNT(*)::text AS n FROM contatos_institucional GROUP BY status`
    ).catch(() => []);

    return ok({ contatos: rows, totais });
  } catch (err) {
    console.error("[Admin/Contatos/GET]", err);
    return serverError();
  }
}
