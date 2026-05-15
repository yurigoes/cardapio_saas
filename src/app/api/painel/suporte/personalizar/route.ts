/**
 * POST /api/painel/suporte/personalizar
 * Body: { chave_atual, nova_senha }
 *
 * Só funciona pra acessos com duracao='sempre'. Usuário troca a chave
 * inicial gerada pelo master por uma senha pessoal mais memorável.
 * Após isso, personalizado=true e a chave inicial deixa de funcionar.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { sha256 } from "@/lib/suporte/token";

const schema = z.object({
  chave_atual: z.string().min(8).max(80),
  nova_senha:  z.string().min(8).max(80),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  if (body.chave_atual === body.nova_senha) {
    return badRequest("Nova senha deve ser diferente da chave atual");
  }

  const hashAtual = sha256(body.chave_atual.trim());
  const hashNovo  = sha256(body.nova_senha.trim());

  try {
    // Busca acesso ativo desta empresa que bata com chave_atual
    const acesso = await queryOne<{
      id: string; duracao: string; personalizado: boolean;
    }>(
      `SELECT id, duracao, personalizado
         FROM suporte_acessos
        WHERE empresa_id = $1
          AND chave_hash = $2
          AND revogado_em IS NULL
          AND (expira_em IS NULL OR expira_em > NOW())
        LIMIT 1`,
      [empresaId, hashAtual]
    );

    if (!acesso) return badRequest("Chave atual inválida");
    if (acesso.duracao !== "sempre") {
      return badRequest("Só acessos com duração 'sempre' podem ser personalizados");
    }

    // Confere se senha nova já está em uso por outro registro (rare race)
    const conflict = await queryOne<{ id: string }>(
      `SELECT id FROM suporte_acessos
        WHERE chave_hash = $1 AND revogado_em IS NULL`,
      [hashNovo]
    );
    if (conflict) return badRequest("Senha já em uso. Escolha outra.");

    await queryOne(
      `UPDATE suporte_acessos
          SET chave_hash       = $1,
              chave_prefix     = $2,
              personalizado    = TRUE,
              personalizado_em = NOW(),
              ultimo_uso       = NOW(),
              ultimo_uso_por   = $3,
              updated_at       = NOW()
        WHERE id = $4`,
      [hashNovo, body.nova_senha.trim().slice(0, 12), sub, acesso.id]
    );

    return ok({ personalizado: true });
  } catch (err) {
    console.error("[Painel/Suporte/Personalizar]", err);
    return serverError();
  }
}
