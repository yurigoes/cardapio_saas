/**
 * GET  /api/painel/integracoes/terminais         → lista terminais da empresa
 * POST /api/painel/integracoes/terminais         → cria novo terminal
 *   Body: { nome, driver, credenciais, config?, padrao_pdv?, padrao_totem? }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin", "gerente"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!ALLOWED.includes(role)) return forbidden();

  try {
    const rows = await query(
      `SELECT id, nome, driver, ativo, padrao_pdv, padrao_totem,
              credenciais, config, observacao,
              created_at, updated_at
         FROM empresa_terminais
        WHERE empresa_id = $1
        ORDER BY created_at DESC`,
      [empresaId]
    );
    // Não vaza merchant_key (mas mostra com mask)
    const sanitized = (rows as Array<Record<string, unknown>>).map(t => {
      const cred = t.credenciais as Record<string, string> | null;
      if (cred?.merchant_key) {
        cred.merchant_key = cred.merchant_key.slice(0, 4) + "•••" + cred.merchant_key.slice(-2);
      }
      return t;
    });
    return ok(sanitized);
  } catch (err) {
    console.error("[Terminais/GET]", err);
    return serverError();
  }
}

const schema = z.object({
  nome:         z.string().min(2).max(80),
  driver:       z.string().min(2).max(50),
  credenciais:  z.record(z.unknown()),
  config:       z.record(z.unknown()).optional(),
  padrao_pdv:   z.boolean().optional(),
  padrao_totem: z.boolean().optional(),
  observacao:   z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();
  if (!ALLOWED.includes(role)) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    // Se marcou como padrão, desmarca outros primeiros
    if (body.padrao_pdv) {
      await query(`UPDATE empresa_terminais SET padrao_pdv = FALSE WHERE empresa_id = $1`, [empresaId]);
    }
    if (body.padrao_totem) {
      await query(`UPDATE empresa_terminais SET padrao_totem = FALSE WHERE empresa_id = $1`, [empresaId]);
    }

    const r = await queryOne<{ id: string }>(
      `INSERT INTO empresa_terminais
         (empresa_id, nome, driver, credenciais, config, padrao_pdv, padrao_totem, observacao, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
       RETURNING id`,
      [empresaId, body.nome, body.driver,
       JSON.stringify(body.credenciais), JSON.stringify(body.config ?? {}),
       body.padrao_pdv ?? false, body.padrao_totem ?? false,
       body.observacao ?? null, sub]
    );
    return created({ id: r?.id });
  } catch (err) {
    console.error("[Terminais/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
