/**
 * GET  /api/painel/config/exige-agente — devolve flag atual
 * POST /api/painel/config/exige-agente — { exige: boolean } toggle
 *
 * Master/admin only. Quando true, painel exige token de agente registrado
 * em cada máquina nova (modal bloqueante via <AgentGate>).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  const r = await queryOne<{ exige_agente_terminal: boolean }>(
    `SELECT COALESCE(exige_agente_terminal, false) AS exige_agente_terminal
       FROM empresas WHERE id = $1`,
    [empresaId]
  );
  return ok({ exige: !!r?.exige_agente_terminal });
}

const schema = z.object({ exige: z.boolean() });

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
    await queryOne(
      `UPDATE empresas
          SET exige_agente_terminal = $1, updated_at = NOW()
        WHERE id = $2`,
      [body.exige, empresaId]
    );
    return ok({ exige: body.exige });
  } catch (err) {
    console.error("[config/exige-agente]", err);
    return serverError();
  }
}
