/**
 * POST /api/sync/agent-validate
 *
 * Valida token de agente. Usado pelo gate do painel pra:
 *   - Confirmar que token é válido + ativo + da mesma empresa do JWT
 *   - Atualizar fingerprint/UA/resolução da máquina
 *   - Bater 1º heartbeat
 *
 * Body: {
 *   token:               "rdt_xxx",
 *   browser_fingerprint?: string,
 *   resolucao?:           string,
 * }
 *
 * Auth: usa JWT do painel pra garantir que token de agente bate com empresa.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { sha256 } from "@/lib/agentes/token";
import { ok, badRequest, forbidden, notFound, serverError } from "@/lib/utils/response";

const schema = z.object({
  token:                z.string().regex(/^rdt_[A-Za-z0-9_-]{20,}$/, "Token inválido"),
  browser_fingerprint:  z.string().max(500).optional(),
  resolucao:            z.string().max(40).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const tokenHash = sha256(body.token);
  const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  try {
    const a = await queryOne<{
      id: string; empresa_id: string; tipo: string; nome: string; status: string;
    }>(
      `UPDATE agentes
          SET browser_fingerprint = COALESCE($1, browser_fingerprint),
              resolucao           = COALESCE($2, resolucao),
              user_agent_ultimo   = $3,
              ultimo_hb_em        = NOW(),
              primeiro_hb_em      = COALESCE(primeiro_hb_em, NOW()),
              status              = 'online',
              updated_at          = NOW()
        WHERE token_hash = $4
          AND empresa_id = $5
          AND ativo = true
          AND deleted_at IS NULL
        RETURNING id, empresa_id, tipo, nome, status`,
      [body.browser_fingerprint ?? null, body.resolucao ?? null, ua, tokenHash, empresaId]
    );

    if (!a) return notFound("Token inválido ou não pertence a esta empresa");

    return ok({
      agente: {
        id:    a.id,
        nome:  a.nome,
        tipo:  a.tipo,
        status: "online",
      },
    });
  } catch (err) {
    console.error("[agent-validate]", err);
    return serverError();
  }
}
