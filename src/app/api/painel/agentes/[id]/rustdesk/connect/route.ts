/**
 * GET /api/painel/agentes/[id]/rustdesk/connect
 *
 * Devolve o protocol handler URL pra abrir o cliente RustDesk com o
 * agente alvo já preenchido. Padrão:
 *   rustdesk://CONNECT?ID=<rustdesk_id>&PASSWORD=<senha_cleartext>
 *
 * IMPORTANTE: Decifra a senha — só master/admin pode chamar e a senha
 * vai por HTTPS pro browser que vai abrir o handler. Não persiste em log.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";
import { decryptIfNeeded } from "@/lib/security/encrypt";

const ALLOWED = ["master", "admin"];

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const a = await queryOne<{
      id: string; nome: string;
      rustdesk_id: string | null;
      rustdesk_password: string | null;
    }>(
      `SELECT id, nome, rustdesk_id, rustdesk_password
         FROM agentes
        WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [params.id, empresaId]
    );
    if (!a) return notFound("Agente não encontrado");
    if (!a.rustdesk_id) {
      return badRequest("Agente sem rustdesk_id — instale o cliente RustDesk e cadastre o ID em /painel/maquinas");
    }
    if (!a.rustdesk_password) {
      return badRequest("Agente sem senha RustDesk — gere uma em /painel/maquinas");
    }

    // Decifra senha (encryptField salva como 'encrypted:...')
    let senha = a.rustdesk_password;
    if (senha.startsWith("encrypted:")) {
      const dec = decryptIfNeeded(senha.slice(10));
      if (!dec) return serverError("Falha ao decifrar senha — verifique ENCRYPTION_KEY");
      senha = dec;
    }

    const url = `rustdesk://CONNECT?ID=${encodeURIComponent(a.rustdesk_id)}&PASSWORD=${encodeURIComponent(senha)}`;

    return ok({
      url,
      agent: { id: a.id, nome: a.nome, rustdesk_id: a.rustdesk_id },
    });
  } catch (err) {
    console.error("[Agentes/Rustdesk/Connect]", err);
    return serverError();
  }
}
