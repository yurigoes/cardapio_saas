/**
 * Auth pra páginas kiosk (sem login JWT).
 *
 * Token kio_xxx é validado contra kiosk_tokens.token_hash.
 * Se válido, registra ultimo_uso e devolve { empresaId, slug, tipo }.
 */
import crypto from "crypto";
import { queryOne } from "@/lib/db/client";
import type { NextRequest } from "next/server";

export interface KioskCtx {
  empresaId: string;
  slug:      string;
  tipo:      string;
}

/**
 * Valida token (do query string ou header) e devolve contexto.
 * Retorna null se inválido.
 */
export async function validarKioskToken(
  req: NextRequest,
  slug: string,
  tipoEsperado: string,
): Promise<KioskCtx | null> {
  const url = req.nextUrl;
  const t = url.searchParams.get("t") || req.headers.get("x-kiosk-token");
  if (!t || !t.startsWith("kio_")) return null;

  const hash = crypto.createHash("sha256").update(t).digest("hex");
  const ip   = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  const row = await queryOne<{ empresa_id: string; tipo: string; slug: string }>(
    `UPDATE kiosk_tokens k
        SET ultimo_uso = NOW(), ultimo_ip = $1::inet
       FROM empresas e
      WHERE k.empresa_id = e.id
        AND k.token_hash = $2
        AND k.ativo = true
        AND e.slug = $3
        AND k.tipo = $4
      RETURNING k.empresa_id, k.tipo, e.slug`,
    [ip ?? null, hash, slug, tipoEsperado]
  ).catch(() => null);

  if (!row) return null;
  return { empresaId: row.empresa_id, slug: row.slug, tipo: row.tipo };
}
