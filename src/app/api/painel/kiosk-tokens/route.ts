/**
 * GET  /api/painel/kiosk-tokens — lista
 * POST /api/painel/kiosk-tokens — cria + retorna token UMA VEZ
 *   Body: { tipo: "cozinha" | "tv" | "delivery" | "totem" }
 *
 * Token de longa duração (não expira) pra usar em totens/TVs/PCs
 * dedicados — sem precisar de login. URL fica:
 *   https://app.tthreedigital.com.br/k/{slug}/{tipo}?t={token}
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin"];
const TIPOS_VALIDOS = ["cozinha", "tv", "delivery", "totem"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const rows = await query(
      `SELECT id, tipo, prefix, ativo, ultimo_uso, ultimo_ip::text AS ultimo_ip, created_at
         FROM kiosk_tokens WHERE empresa_id = $1
        ORDER BY tipo`,
      [empresaId]
    );
    return ok(rows);
  } catch (err) {
    console.error("[KioskTokens/GET]", err);
    return serverError();
  }
}

const schema = z.object({
  tipo: z.enum(TIPOS_VALIDOS as [string, ...string[]]),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    // Apaga token anterior do mesmo tipo (UNIQUE constraint)
    await queryOne(
      `DELETE FROM kiosk_tokens WHERE empresa_id = $1 AND tipo = $2`,
      [empresaId, body.tipo]
    );

    const raw     = crypto.randomBytes(24).toString("base64url");
    const fullKey = `kio_${raw}`;
    const prefix  = fullKey.slice(0, 12);
    const hash    = crypto.createHash("sha256").update(fullKey).digest("hex");

    const r = await queryOne<{ id: string }>(
      `INSERT INTO kiosk_tokens (empresa_id, tipo, prefix, token_hash, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [empresaId, body.tipo, prefix, hash, sub]
    );

    // Pega slug pra montar URL
    const e = await queryOne<{ slug: string }>(
      `SELECT slug FROM empresas WHERE id = $1`, [empresaId]
    );

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tthreedigital.com.br";
    const url = `${baseUrl}/k/${e?.slug}/${body.tipo}?t=${fullKey}`;

    return created({
      id: r?.id,
      tipo: body.tipo,
      prefix,
      token: fullKey,
      url,
      aviso: "Salve esta URL agora. Cole no PC/TV/totem dedicado — não precisa mais de login.",
    });
  } catch (err) {
    console.error("[KioskTokens/POST]", err);
    return serverError();
  }
}
