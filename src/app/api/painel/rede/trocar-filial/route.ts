/**
 * POST /api/painel/rede/trocar-filial
 * Body: { filial_id }
 *
 * Gera novo access_token com empresa_id atualizado pra a filial alvo.
 * Só funciona se o usuário tem permissão (opera_todas_filiais=true E
 * mesma rede_id) OU é master/suporte.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne, query } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { podeOperarFilial } from "@/lib/rede/scope";
import { signAccessToken } from "@/lib/auth/jwt";

const schema = z.object({ filial_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role, sub } = auth.payload;

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  if (!empresaId) return forbidden();
  if (body.filial_id === empresaId) {
    return ok({ jaEstava: true });
  }

  if (!await podeOperarFilial(sub, role, empresaId, body.filial_id)) {
    return forbidden("Você não pode operar esta filial");
  }

  try {
    // Carrega dados da filial alvo
    const filial = await queryOne<{ id: string; nome_fantasia: string; status: string; rede_id: string | null }>(
      `SELECT id, nome_fantasia, status, rede_id FROM empresas
        WHERE id = $1 AND deleted_at IS NULL`,
      [body.filial_id]
    );
    if (!filial) return badRequest("Filial não encontrada");
    if (filial.status === "suspenso" || filial.status === "inativo") {
      return badRequest(`Filial ${filial.nome_fantasia} está ${filial.status}`);
    }

    // Carrega dados do usuário pra montar token completo
    const usr = await queryOne<{ email: string; nome: string }>(
      `SELECT email, nome FROM usuarios WHERE id = $1`, [sub]
    );
    if (!usr) return badRequest("Usuário não encontrado");

    // Gera novo token apontando pra nova filial
    const novoToken = await signAccessToken({
      sub, role, empresaId: body.filial_id,
      email: usr.email, nome: usr.nome,
      sessionId: auth.payload.sessionId,
    });

    // Audit
    const ip = (req.headers.get("x-forwarded-for") ?? "0.0.0.0").split(",")[0].trim();
    await query(
      `INSERT INTO rede_audit_troca_filial (usuario_id, rede_id, empresa_de, empresa_pra, ip)
       VALUES ($1, $2, $3, $4, $5::inet)`,
      [sub, filial.rede_id, empresaId, body.filial_id, ip]
    ).catch(() => null);

    return ok({
      access_token: novoToken,
      empresa_id:   body.filial_id,
      empresa_nome: filial.nome_fantasia,
    });
  } catch (err) {
    console.error("[Rede/TrocarFilial]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
