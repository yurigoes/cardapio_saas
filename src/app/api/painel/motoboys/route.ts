import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { z } from "zod";

const motoboySchema = z.object({
  nome:       z.string().min(2).max(100).trim(),
  telefone:   z.string().max(20).trim().optional(),
  veiculo:    z.string().max(50).trim().optional(),
  placa:      z.string().max(10).trim().optional(),
  status:     z.enum(["disponivel", "em_entrega", "inativo"]).default("disponivel"),
  usuario_id: z.string().uuid().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  const motoboys = await query(
    `SELECT m.id, m.nome, m.telefone, m.veiculo, m.placa, m.status, m.ativo,
            m.created_at, m.usuario_id,
            m.lat_atual::text  AS lat_atual,
            m.lng_atual::text  AS lng_atual,
            m.localizado_em::text AS localizado_em,
            u.email            AS usuario_email
     FROM motoboys m
     LEFT JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.empresa_id = $1 AND COALESCE(m.ativo, true) = true
     ORDER BY m.nome`,
    [empresaId]
  );

  return ok(motoboys);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "motoboy:gerenciar")) return forbidden();

  let body: z.infer<typeof motoboySchema>;
  try {
    body = motoboySchema.parse(await req.json());
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  try {
    const motoboy = await queryOne<{ id: string }>(
      `INSERT INTO motoboys (empresa_id, nome, telefone, veiculo, placa, status, ativo, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       RETURNING id`,
      [empresaId, body.nome, body.telefone ?? null, body.veiculo ?? null, body.placa ?? null, body.status, body.usuario_id ?? null]
    );

    return created({ id: motoboy?.id });
  } catch (err) {
    console.error("[Painel/Motoboys/POST]", err);
    return serverError();
  }
}
