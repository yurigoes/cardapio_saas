/**
 * GET /api/pub/planos
 * Endpoint PÚBLICO — landing page lista os planos.
 */
import { query } from "@/lib/db/client";
import { ok, serverError } from "@/lib/utils/response";

export async function GET() {
  try {
    const planos = await query(
      `SELECT id, nome, descricao, preco_mensal, modulos, destaque
         FROM planos WHERE ativo = true
        ORDER BY preco_mensal ASC`
    );
    return ok(planos);
  } catch (err) {
    console.error("[Pub/Planos]", err);
    return serverError();
  }
}
