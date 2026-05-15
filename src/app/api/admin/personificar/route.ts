/**
 * POST /api/admin/personificar      Body: { alvo_id, motivo? }
 *   Master gera JWT como se fosse o usuário alvo. Logado em audit.
 *   Retorna { access_token } pra usar no painel.
 *
 * DELETE /api/admin/personificar    Encerra personificação ativa.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { signAccessToken } from "@/lib/auth/jwt";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

const schema = z.object({
  alvo_id: z.string().uuid(),
  motivo:  z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const alvo = await queryOne<{
      id: string; email: string; role: string; empresa_id: string | null; nome: string;
    }>(
      `SELECT id, email, role, empresa_id, nome
         FROM usuarios WHERE id = $1 AND ativo = true AND deleted_at IS NULL`,
      [body.alvo_id]
    );
    if (!alvo) return notFound("usuário não encontrado");
    if (alvo.role === "master") return badRequest("não pode personificar outro master");

    // Gera JWT como se fosse o alvo (1h, mais curto que normal)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;

    await queryOne(
      `INSERT INTO suporte_personificacoes (master_id, alvo_id, motivo, ip_origem)
       VALUES ($1, $2, $3, $4)`,
      [auth.payload.sub, alvo.id, body.motivo ?? null, ip]
    ).catch(() => {});

    const token = await signAccessToken({
      sub:        alvo.id,
      email:      alvo.email,
      role:       alvo.role as "master" | "admin" | "operador" | "garcom" | "cozinha" | "caixa" | "gerente",
      empresaId:  alvo.empresa_id ?? undefined,
    });

    return ok({
      access_token:  token,
      expires_in:    3600,
      personificado: { id: alvo.id, nome: alvo.nome, email: alvo.email, role: alvo.role },
      master_id:     auth.payload.sub,
    });
  } catch (err) {
    console.error("[Personificar]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  await queryOne(
    `UPDATE suporte_personificacoes
        SET finalizado_em = NOW()
      WHERE master_id = $1 AND finalizado_em IS NULL`,
    [auth.payload.sub]
  ).catch(() => {});

  return ok({ encerrado: true });
}
