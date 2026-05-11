import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { z } from "zod";

const zonaSchema = z.object({
  nome:      z.string().min(2).max(100).trim(),
  descricao: z.string().max(500).trim().optional(),
  taxa:      z.number().min(0),
  tempo_min: z.number().int().min(0).optional(),
  ativo:     z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  const zonas = await query(
    `SELECT id, nome, descricao, taxa, tempo_min, ativo
     FROM zonas_entrega
     WHERE empresa_id = $1
     ORDER BY taxa`,
    [empresaId]
  );

  return ok(zonas);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "delivery:atribuir")) return forbidden();

  let body: z.infer<typeof zonaSchema>;
  try {
    body = zonaSchema.parse(await req.json());
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  try {
    const zona = await queryOne<{ id: string }>(
      `INSERT INTO zonas_entrega (empresa_id, nome, descricao, taxa, tempo_min, ativo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [empresaId, body.nome, body.descricao ?? null, body.taxa, body.tempo_min ?? null, body.ativo]
    );

    return created({ id: zona?.id });
  } catch (err) {
    console.error("[Painel/ZonasEntrega/POST]", err);
    return serverError();
  }
}
