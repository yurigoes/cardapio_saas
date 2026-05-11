/**
 * GET /api/painel/whatsapp/qr → retorna QR code atual da instância da empresa
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temRole } from "@/lib/auth/rbac";
import { ok, forbidden, serverError } from "@/lib/utils/response";

const EVO_BASE = process.env.EVOLUTION_API_URL ?? "http://evolution:8080";
const EVO_KEY  = process.env.EVOLUTION_API_KEY ?? "";

function evoHeaders() {
  return { "apikey": EVO_KEY, "Content-Type": "application/json" };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temRole(role, "admin")) return forbidden();

  const row = await queryOne<{ slug: string }>(
    `SELECT slug FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
    [empresaId]
  );
  const slug = row?.slug;
  if (!slug) return serverError("Empresa não encontrada");

  try {
    const res = await fetch(`${EVO_BASE}/instance/connect/${slug}`, {
      headers: evoHeaders(),
    });

    if (res.status === 404 || res.status === 400) {
      return ok({ qr: null, pairingCode: null, status: "nao_criada" });
    }

    if (!res.ok) {
      return serverError("Erro ao obter QR code");
    }

    const data = await res.json() as {
      base64?:     string;
      qrcode?:     { base64?: string; code?: string };
      pairingCode?: string;
      code?:        string;
    };

    const qr          = data?.qrcode?.base64 ?? data?.base64 ?? null;
    const pairingCode = data?.pairingCode ?? data?.qrcode?.code ?? data?.code ?? null;

    return ok({ qr, pairingCode });
  } catch (err) {
    console.error("[WhatsApp/QR/GET]", err);
    return serverError();
  }
}
