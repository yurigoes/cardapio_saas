/**
 * WhatsApp / Evolution API — gerenciamento por empresa
 *
 * GET  /api/painel/whatsapp        → status da instância + QR code
 * POST /api/painel/whatsapp        → cria instância (se não existir)
 * DELETE /api/painel/whatsapp      → logout (desconecta WhatsApp)
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError, notFound } from "@/lib/utils/response";
import {
  createInstance,
  getQrCode,
  getConnectionState,
  logoutInstance,
} from "@/lib/evolution/client";

async function getEmpresaSlug(empresaId: string): Promise<string | null> {
  const row = await queryOne<{ slug: string }>(
    `SELECT slug FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
    [empresaId]
  );
  return row?.slug ?? null;
}

// GET — status + QR code
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!["master","admin","gerente"].includes(role)) return forbidden();

  const slug = await getEmpresaSlug(empresaId);
  if (!slug) return notFound("Empresa não encontrada");

  try {
    const [state, qrcode] = await Promise.all([
      getConnectionState(slug),
      getQrCode(slug),
    ]);

    return ok({
      slug,
      state,          // "open" | "close" | "connecting"
      connected: state === "open",
      qrcode: state !== "open" ? qrcode : null,
    });
  } catch (err) {
    console.error("[WhatsApp/GET]", err);
    // Se Evolution não configurado, retorna status desconhecido
    return ok({ slug, state: "unavailable", connected: false, qrcode: null });
  }
}

// POST — cria/reconecta instância
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!["master","admin","gerente"].includes(role)) return forbidden();

  const slug = await getEmpresaSlug(empresaId);
  if (!slug) return notFound("Empresa não encontrada");

  try {
    await createInstance(slug);
    const [state, qrcode] = await Promise.all([
      getConnectionState(slug),
      getQrCode(slug),
    ]);

    return ok({
      slug,
      state,
      connected: state === "open",
      qrcode: state !== "open" ? qrcode : null,
      message: "Instância iniciada. Escaneie o QR code com o WhatsApp.",
    });
  } catch (err) {
    console.error("[WhatsApp/POST]", err);
    return serverError("Falha ao iniciar instância WhatsApp");
  }
}

// DELETE — logout
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!["master","admin","gerente"].includes(role)) return forbidden();

  const slug = await getEmpresaSlug(empresaId);
  if (!slug) return notFound("Empresa não encontrada");

  try {
    await logoutInstance(slug);
    return ok({ desconectado: true });
  } catch (err) {
    console.error("[WhatsApp/DELETE]", err);
    return serverError("Falha ao desconectar WhatsApp");
  }
}
