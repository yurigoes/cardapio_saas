/**
 * DELETE /api/painel/empresa/documentos/[docId]  → cliente apaga doc próprio (se ainda não validado)
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { docId: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const doc = await queryOne<{ validado: boolean }>(
      `SELECT validado FROM empresa_documentos WHERE id = $1 AND empresa_id = $2`,
      [params.docId, empresaId]
    );
    if (!doc) return notFound();
    // Cliente pode remover docs pendentes OU rejeitados (pra re-enviar). Validados não.
    if (doc.validado === true) return badRequest("Documento já validado — peça ao suporte pra remover");

    await queryOne(
      `DELETE FROM empresa_documentos WHERE id = $1 AND empresa_id = $2`,
      [params.docId, empresaId]
    );
    return ok({ removido: true });
  } catch (err) {
    console.error("[Empresa/Docs/DELETE]", err);
    return serverError();
  }
}
