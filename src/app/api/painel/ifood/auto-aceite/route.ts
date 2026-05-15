/**
 * POST /api/painel/ifood/auto-aceite
 * Body: { auto_aceite: boolean }
 *
 * Liga/desliga auto-aceite de pedidos iFood pra empresa.
 * Se ON: importer chama /confirm automático + dispara cupom cozinha.
 * Se OFF: pedido entra como 'pendente' e popup no painel pede ação manual.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin"];

const schema = z.object({ auto_aceite: z.boolean() });

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const existente = await queryOne<{ id: string }>(
      `SELECT id FROM ifood_config WHERE empresa_id = $1`,
      [empresaId]
    );
    if (!existente) return badRequest("Configure a integração iFood antes de ativar auto-aceite");

    await queryOne(
      `UPDATE ifood_config
          SET auto_aceite = $1,
              updated_at  = NOW()
        WHERE empresa_id  = $2`,
      [body.auto_aceite, empresaId]
    );

    return ok({ auto_aceite: body.auto_aceite });
  } catch (err) {
    console.error("[Ifood/auto-aceite]", err);
    return serverError();
  }
}
