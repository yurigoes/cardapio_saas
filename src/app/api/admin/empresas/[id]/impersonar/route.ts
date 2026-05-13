/**
 * POST /api/admin/empresas/[id]/impersonar
 *
 * Master "veste" o papel de admin daquela empresa.
 * Retorna um access_token novo com role='admin' + empresaId fixo,
 * E o token original do master (pra poder voltar).
 *
 * O frontend troca o token no localStorage e mostra banner "Operando como X".
 *
 * Auditoria: registra ação master_impersonar.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { signAccessToken } from "@/lib/auth/jwt";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";
import crypto from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Apenas master");

  try {
    const empresa = await queryOne<{ id: string; nome_fantasia: string; slug: string; status: string }>(
      `SELECT id, nome_fantasia, slug, status
         FROM empresas
        WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    // Lê dados do master pra reaproveitar nome/email no token vestido
    const master = await queryOne<{ email: string; nome: string }>(
      `SELECT email, nome FROM usuarios WHERE id = $1`,
      [auth.payload.sub]
    );

    // Cria um access_token "vestindo" a empresa.
    // Mantém sub do master (rastreabilidade) + flag impersonating.
    const novoToken = await signAccessToken({
      sub:        auth.payload.sub,                    // master continua sendo o ator
      email:      master?.email ?? auth.payload.email,
      nome:       `${master?.nome ?? "Master"} → ${empresa.nome_fantasia}`,
      role:       "admin",                             // veste permissões de admin
      empresaId:  empresa.id,
      sessionId:  auth.payload.sessionId,
      impersonating: true,
      impersonatedBy: auth.payload.sub,
    } as Parameters<typeof signAccessToken>[0]);

    await auditLog({
      acao:       "master:impersonar",
      recurso:    "empresas",
      recursoId:  empresa.id,
      dadosNovos: { empresa: empresa.nome_fantasia, slug: empresa.slug },
      usuario:    { sub: auth.payload.sub, empresaId: undefined },
    });

    return ok({
      access_token: novoToken,
      empresa: {
        id:            empresa.id,
        nome_fantasia: empresa.nome_fantasia,
        slug:          empresa.slug,
        status:        empresa.status,
      },
      // Para frontend salvar e poder voltar
      master_token_hint: crypto.createHash("sha256")
        .update((req.headers.get("authorization") ?? "").slice(7))
        .digest("hex").slice(0, 16),
    });
  } catch (err) {
    console.error("[Admin/Impersonar]", err);
    return serverError();
  }
}
