/**
 * GET /api/admin/inventario/tvs-com-ip?secret=XXX
 * Lista TVs do inventario que tem IP local cadastrado.
 * Usado pelo agente local tirar-prints.ps1.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

const SECRET = process.env.PROVISION_SECRET || "td-provision-2026";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== SECRET) return NextResponse.json({ ok: false, error: "secret inválido" }, { status: 401 });
  await ensureSchema();
  const r = await db().query<{ id: string; nome: string; mac: string; ip_local: string }>(
    `SELECT id, nome, mac, ip_local FROM midia_inventario
       WHERE ip_local IS NOT NULL AND ip_local <> ''
         AND mac IS NOT NULL AND mac <> ''
         AND tipo IN ('box','tv','tv-box')
         AND ativo = true
       ORDER BY nome`
  );
  return NextResponse.json({ ok: true, tvs: r.rows });
}
