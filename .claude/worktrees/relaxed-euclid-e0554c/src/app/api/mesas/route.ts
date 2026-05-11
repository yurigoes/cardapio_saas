import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, created, forbidden, badRequest, conflict, serverError } from "@/lib/utils/response";
import { assertModuloAtivo } from "@/lib/modules/checker";
import { isDuplicateKeyError } from "@/lib/utils/errors";

const mesaSchema = z.object({
  numero:     z.number().int().min(1).max(9999),
  nome:       z.string().max(50).optional(),
  capacidade: z.number().int().min(1).max(100).optional().default(4),
  setor:      z.string().max(100).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "mesa:ver")) return forbidden();

  try {
    await assertModuloAtivo(empresaId, "mesa");
  } catch {
    return forbidden("Módulo Mesas não está ativo");
  }

  const mesas = await query(
    `SELECT
       m.id, m.numero, m.nome, m.capacidade, m.setor,
       m.status, m.qrcode_url,
       p.id as pedido_id, p.numero as pedido_numero, p.total as pedido_total,
       EXTRACT(EPOCH FROM (NOW() - p.created_at))::int as tempo_aberta_segundos
     FROM mesas m
     LEFT JOIN pedidos p ON p.id = m.pedido_ativo_id
     WHERE m.empresa_id = $1 AND m.deleted_at IS NULL
     ORDER BY m.setor NULLS LAST, m.numero`,
    [empresaId]
  );

  return ok(mesas);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "mesa:editar")) return forbidden();

  let body: z.infer<typeof mesaSchema>;
  try {
    body = mesaSchema.parse(await req.json());
  } catch (err: unknown) {
    const msg = err instanceof z.ZodError ? err.errors[0]?.message : "Dados inválidos";
    return badRequest(msg ?? "Dados inválidos");
  }

  try {
    const mesa = await queryOne<{ id: string }>(
      `INSERT INTO mesas (empresa_id, numero, nome, capacidade, setor)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [empresaId, body.numero, body.nome ?? null, body.capacidade, body.setor ?? null]
    );

    return created(mesa);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return conflict(`Mesa número ${body.numero} já existe`);
    }
    console.error("[Mesas/POST]", err);
    return serverError();
  }
}
