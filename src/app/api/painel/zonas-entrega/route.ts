/**
 * GET  /api/painel/zonas-entrega   → lista zonas da empresa
 * POST /api/painel/zonas-entrega   → cria nova zona
 *
 * Reaproveita zonas_entrega (legada) estendida pela migration 031.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin", "gerente"];

const createSchema = z.object({
  nome:          z.string().min(1).max(100).trim(),
  bairro:        z.string().max(100).optional().or(z.literal("")),
  cep_inicio:    z.string().regex(/^\d{8}$/).optional().or(z.literal("")),
  cep_fim:       z.string().regex(/^\d{8}$/).optional().or(z.literal("")),
  valor_cobrado: z.number().min(0).max(99999.99).default(0),
  valor_motoboy: z.number().min(0).max(99999.99).default(0),
  tempo_min:     z.number().int().min(1).max(300).optional(),
  ativo:         z.boolean().default(true),
  ordem:         z.number().int().default(0),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const rows = await query(
      `SELECT id, nome, bairro, cep_inicio, cep_fim,
              COALESCE(valor_cobrado, taxa, 0) AS valor_cobrado,
              COALESCE(valor_motoboy, 0)       AS valor_motoboy,
              tempo_min, ativo, ordem,
              created_at
         FROM zonas_entrega
        WHERE empresa_id = $1
        ORDER BY ordem ASC, nome ASC`,
      [empresaId]
    );
    return ok(rows);
  } catch (err) {
    console.error("[Zonas/GET]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO zonas_entrega
         (empresa_id, nome, bairro, cep_inicio, cep_fim,
          taxa, valor_cobrado, valor_motoboy, tempo_min, ativo, ordem)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        empresaId, body.nome,
        body.bairro     || null,
        body.cep_inicio || null, body.cep_fim || null,
        body.valor_cobrado, body.valor_motoboy,
        body.tempo_min ?? null, body.ativo, body.ordem,
      ]
    );
    return created({ id: row?.id });
  } catch (err) {
    console.error("[Zonas/POST]", err);
    return serverError();
  }
}
