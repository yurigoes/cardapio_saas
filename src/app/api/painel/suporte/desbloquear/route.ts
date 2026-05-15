/**
 * POST /api/painel/suporte/desbloquear
 * Body: { chave: "sup_xxx" }
 *
 * Empresa cola a chave que o master enviou. Se válida e ativa, retorna
 * sucesso (front salva em localStorage 'suporte_unlocked' = true).
 *
 * Atualiza ultimo_uso.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { sha256 } from "@/lib/suporte/token";

const schema = z.object({
  chave: z.string().min(8).max(80),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const chaveHash = sha256(body.chave.trim());

  try {
    const row = await queryOne<{
      id: string; duracao: string; personalizado: boolean;
      expira_em: string | null;
    }>(
      `UPDATE suporte_acessos
          SET ultimo_uso     = NOW(),
              ultimo_uso_por = $1,
              acessos_count  = acessos_count + 1,
              updated_at     = NOW()
        WHERE empresa_id = $2
          AND chave_hash = $3
          AND revogado_em IS NULL
          AND (expira_em IS NULL OR expira_em > NOW())
        RETURNING id, duracao, personalizado, expira_em::text`,
      [sub, empresaId, chaveHash]
    );

    if (!row) {
      return badRequest("Chave inválida, expirada ou não pertence a esta empresa");
    }

    return ok({
      desbloqueado:  true,
      duracao:       row.duracao,
      expira_em:     row.expira_em,
      personalizado: row.personalizado,
      pode_personalizar: row.duracao === "sempre" && !row.personalizado,
    });
  } catch (err) {
    console.error("[Painel/Suporte/Desbloquear]", err);
    return serverError();
  }
}
