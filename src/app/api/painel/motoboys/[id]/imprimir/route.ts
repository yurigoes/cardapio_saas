/**
 * POST /api/painel/motoboys/[id]/imprimir
 * Body: { formato: "sintetico" | "analitico", data?: "YYYY-MM-DD" }
 *
 * Enfileira impressão do relatório do motoboy via agente.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, forbidden, badRequest } from "@/lib/utils/response";
import { dispatchRelatorioMotoboy } from "@/lib/print/dispatch";

const schema = z.object({
  formato: z.enum(["sintetico", "analitico"]).default("sintetico"),
  data:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const data = body.data ?? new Date().toISOString().slice(0, 10);

  await dispatchRelatorioMotoboy(empresaId, params.id, data, body.formato);

  return ok({
    motoboy_id: params.id, formato: body.formato, data,
    mensagem: `Cupom ${body.formato} do motoboy enfileirado`,
  });
}
