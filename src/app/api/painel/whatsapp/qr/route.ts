/**
 * GET /api/painel/whatsapp/qr → retorna QR code atual da instância da empresa
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temRole } from "@/lib/auth/rbac";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temRole(role, "admin")) return forbidden();

  const row = await queryOne<{ slug: string; evolution_url: string | null; evolution_key: string | null }>(
    `SELECT slug, evolution_url, evolution_key FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
    [empresaId]
  );
  if (!row?.slug) return serverError("Empresa não encontrada");

  const slug    = row.slug;
  const EVO_URL = row.evolution_url || process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const EVO_KEY = row.evolution_key || process.env.EVOLUTION_API_KEY || "";

  try {
    const res = await fetch(`${EVO_URL}/instance/connect/${slug}`, {
      headers: { "apikey": EVO_KEY, "Content-Type": "application/json" },
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
