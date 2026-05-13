/**
 * POST /api/painel/lgpd/excluir-conta
 *
 * LGPD Art. 18 VI — Eliminação dos dados.
 * Marca a empresa pra exclusão definitiva em 30 dias (período de
 * recuperação caso usuário se arrependa). Suspende o acesso imediato.
 *
 * Body: { confirmacao: <slug da empresa> }
 *
 * Apenas role=master ou admin da própria empresa.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master", "admin"].includes(auth.payload.role)) {
    return forbidden("Apenas admin/master pode solicitar exclusão");
  }
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden("Empresa não identificada");

  let body: { confirmacao?: string };
  try { body = await req.json(); }
  catch { return badRequest("Body inválido"); }

  if (!body.confirmacao) {
    return badRequest("Campo 'confirmacao' obrigatório (digite o slug da empresa)");
  }

  try {
    const empresa = await queryOne<{ slug: string; nome_fantasia: string }>(
      `SELECT slug, nome_fantasia FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
      [empresaId]
    );
    if (!empresa) return badRequest("Empresa não encontrada ou já excluída");
    if (body.confirmacao !== empresa.slug) {
      return badRequest(`Confirmação não bate. Pra confirmar exclusão, envie 'confirmacao': '${empresa.slug}'`);
    }

    const exclusaoFinal = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await queryOne(
      `UPDATE empresas
          SET deleted_at = NOW(),
              status = 'excluindo',
              updated_at = NOW()
        WHERE id = $1`,
      [empresaId]
    );

    // Revoga sessões ativas
    await queryOne(
      `UPDATE sessoes SET revogada = true, revogada_em = NOW()
        WHERE usuario_id IN (SELECT id FROM usuarios WHERE empresa_id = $1)
          AND revogada = false`,
      [empresaId]
    ).catch(() => {});

    await auditLog({
      acao:      "lgpd:excluir-conta",
      recurso:   "empresas",
      recursoId: empresaId,
      dadosNovos: { exclusao_definitiva_em: exclusaoFinal },
      usuario:   { sub, empresaId },
    });

    return ok({
      empresa:                empresa.nome_fantasia,
      acesso_suspenso_em:     new Date().toISOString(),
      exclusao_definitiva_em: exclusaoFinal,
      mensagem: "Sua conta foi suspensa. Os dados serão excluídos definitivamente em 30 dias. Pra reativar dentro desse prazo, contate dpo@tthreedigital.com.br.",
    });
  } catch (err) {
    console.error("[LGPD/ExcluirConta]", err);
    return serverError();
  }
}
