/**
 * GET /api/admin/agentes/[id]/rustdesk-connect
 *
 * Master only. Cross-tenant: pode conectar em máquinas de qualquer empresa.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";
import { decryptIfNeeded } from "@/lib/security/encrypt";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    const a = await queryOne<{
      id: string; nome: string;
      empresa_id: string;
      rustdesk_id: string | null;
      rustdesk_password: string | null;
    }>(
      `SELECT id, nome, empresa_id, rustdesk_id, rustdesk_password
         FROM agentes
        WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );
    if (!a) return notFound("Agente não encontrado");
    if (!a.rustdesk_id) return badRequest("Agente sem rustdesk_id");
    if (!a.rustdesk_password) return badRequest("Agente sem senha RustDesk configurada");

    let senha = a.rustdesk_password;
    if (senha.startsWith("encrypted:")) {
      const dec = decryptIfNeeded(senha.slice(10));
      if (!dec) return serverError("Falha ao decifrar senha");
      senha = dec;
    }

    const url = `rustdesk://CONNECT?ID=${encodeURIComponent(a.rustdesk_id)}&PASSWORD=${encodeURIComponent(senha)}`;
    return ok({
      url,
      agent: { id: a.id, nome: a.nome, rustdesk_id: a.rustdesk_id },
    });
  } catch (err) {
    console.error("[Admin/Agentes/RustdeskConnect]", err);
    return serverError();
  }
}
