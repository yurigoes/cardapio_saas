/**
 * POST /api/admin/empresas/[id]/extend-trial
 *
 * Estende trial de uma empresa em N dias adicionais.
 * Body: { dias: number, motivo?: string }
 * - dias: 1..90
 *
 * Acumula sobre trial_fim atual (ou NOW se já expirou).
 * Reabre status para 'teste' se estava 'suspensa'/'cancelada'.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";
import { estenderTrial, getTrialInfo } from "@/lib/billing/trial";

const bodySchema = z.object({
  dias:   z.number().int().min(1).max(90),
  motivo: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Apenas master");

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    const antes = await getTrialInfo(params.id);
    if (!antes) return notFound("Empresa não encontrada");

    const depois = await estenderTrial(params.id, body.dias);

    await auditLog({
      acao:       "empresa:extender-trial",
      recurso:    "empresas",
      recursoId:  params.id,
      dadosAntes: { trial_fim: antes.trial_fim,  status: antes.status },
      dadosNovos: { trial_fim: depois?.trial_fim, status: depois?.status, dias: body.dias, motivo: body.motivo },
      usuario:    { sub: auth.payload.sub, empresaId: undefined },
    });

    return ok(depois);
  } catch (err) {
    console.error("[Admin/ExtendTrial]", err);
    return serverError();
  }
}
