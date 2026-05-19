/**
 * POST /api/admin/migracao-hd/auth
 *
 * Segunda camada de proteção (além de master) pra área de migração
 * de disco — operação destrutiva que NÃO deve ser exposta nem pra
 * outros masters.
 *
 * Body: { password }
 * Resp: { ok: true } se OK, 401 se inválido
 *
 * Senha é constante server-only (nunca vai pro browser bundle).
 * Comparação timing-safe.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";

// ⚠ SERVER-ONLY: never exposed to client bundle (route handlers run only on server)
const MASTER_HD_PASSWORD = "A10babafac";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") {
    return NextResponse.json({ ok: false, error: "Acesso exclusivo master" }, { status: 403 });
  }

  let body: { password?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }

  const provided = String(body?.password ?? "");
  // Pad pra mesmo tamanho pra timing-safe não vazar comprimento
  const a = Buffer.from(provided.padEnd(64, "\0").slice(0, 64));
  const b = Buffer.from(MASTER_HD_PASSWORD.padEnd(64, "\0").slice(0, 64));
  const eq = a.length === b.length && timingSafeEqual(a, b)
          && provided.length === MASTER_HD_PASSWORD.length;

  if (!eq) {
    // Pequena latência pra desincentivar brute force
    await new Promise(r => setTimeout(r, 800));
    return NextResponse.json({ ok: false, error: "Senha inválida" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
