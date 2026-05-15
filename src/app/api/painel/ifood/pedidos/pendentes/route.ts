/**
 * GET /api/painel/ifood/pedidos/pendentes
 *
 * Lista pedidos iFood com ifood_aceite_status='pendente' da empresa.
 * Usado pelo popup de aceite manual no painel (polling curto).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const rows = await query<{
      id: string;
      numero: number;
      cliente_nome: string | null;
      total: string;
      created_at: string;
      ifood_order_id: string | null;
    }>(
      `SELECT id, numero, cliente_nome, total, created_at, ifood_order_id
         FROM pedidos
        WHERE empresa_id = $1
          AND origem = 'ifood'
          AND ifood_aceite_status = 'pendente'
        ORDER BY created_at ASC
        LIMIT 20`,
      [empresaId]
    ).catch(() => []);

    return ok({ pedidos: rows });
  } catch (err) {
    console.error("[Ifood/pendentes]", err);
    return serverError();
  }
}
