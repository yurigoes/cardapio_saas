/**
 * GET /api/painel/cobrancas-avulsas
 * Cliente vê suas cobranças avulsas (manual/extra/ajuste).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { ok, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return ok([]);

  try {
    const rows = await query(
      `SELECT id, nome, motivo, valor, vencimento, status,
              mp_init_point, pago_em, pago_via, origem
         FROM cobrancas_avulsas
        WHERE empresa_id = $1
          AND status IN ('aberta','atrasada','paga')
        ORDER BY status = 'paga' ASC, vencimento ASC`,
      [empresaId]
    );
    return ok(rows);
  } catch (err) {
    console.error("[CobrAv/Cliente/GET]", err);
    return serverError();
  }
}
