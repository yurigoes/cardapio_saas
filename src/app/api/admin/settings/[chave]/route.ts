/**
 * GET   /api/admin/settings/[chave]
 * PATCH /api/admin/settings/[chave]
 *
 * Master only. Lê/escreve em settings (key/value JSONB).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";

const CHAVES_PERMITIDAS = ["manutencao", "alertas_whatsapp"];

export async function GET(
  req: NextRequest,
  { params }: { params: { chave: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();
  if (!CHAVES_PERMITIDAS.includes(params.chave)) return notFound();

  try {
    const r = await queryOne<{ valor: unknown }>(
      `SELECT valor FROM settings WHERE chave = $1`, [params.chave]
    );
    return ok({ chave: params.chave, valor: r?.valor ?? null });
  } catch (err) {
    console.error("[Settings/GET]", err);
    return serverError();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { chave: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();
  if (!CHAVES_PERMITIDAS.includes(params.chave)) return notFound();

  let valor: unknown;
  try { ({ valor } = await req.json()); } catch { return ok({}); }

  try {
    await queryOne(
      `INSERT INTO settings (chave, valor, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (chave) DO UPDATE
         SET valor = EXCLUDED.valor, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [params.chave, JSON.stringify(valor), auth.payload.sub]
    );
    return ok({ chave: params.chave, valor });
  } catch (err) {
    console.error("[Settings/PATCH]", err);
    return serverError();
  }
}
