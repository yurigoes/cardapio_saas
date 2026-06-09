/**
 * POST /api/admin/inventario/screenshot-request  - solicita print (admin)
 *   Body: { id: inventario_id }
 * GET  /api/admin/inventario/screenshot-request?secret=XXX  - agente local consome a fila
 *   Retorna ate 20 requests pendentes
 * PATCH /api/admin/inventario/screenshot-request  - agente marca como capturado/falha
 *   Body: { id, status, erro?, secret }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const SECRET = process.env.PROVISION_SECRET || "td-provision-2026";

export async function POST(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? "");
  if (!id) return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 });
  const inv = await db().query<{ mac: string | null; ip_local: string | null }>(
    `SELECT mac, ip_local FROM midia_inventario WHERE id = $1`, [id]
  );
  const row = inv.rows[0];
  if (!row?.mac) return NextResponse.json({ ok: false, error: "Item sem MAC cadastrado" }, { status: 400 });
  if (!row.ip_local) return NextResponse.json({ ok: false, error: "Item sem IP local cadastrado" }, { status: 400 });
  // Dedupe: se já tem pendente, retorna o existente
  const ja = await db().query<{ id: string }>(
    `SELECT id FROM midia_screenshot_requests WHERE inventario_id = $1 AND status = 'pendente'`, [id]
  );
  if (ja.rows[0]) return NextResponse.json({ ok: true, id: ja.rows[0].id, ja_pendente: true });

  const r = await db().query<{ id: string }>(
    `INSERT INTO midia_screenshot_requests (inventario_id, mac, ip) VALUES ($1, $2, $3) RETURNING id`,
    [id, row.mac.toUpperCase(), row.ip_local]
  );
  return NextResponse.json({ ok: true, id: r.rows[0].id });
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== SECRET) return NextResponse.json({ ok: false, error: "secret inválido" }, { status: 401 });
  await ensureSchema();
  const r = await db().query<{ id: string; mac: string; ip: string; inventario_id: string }>(
    `SELECT id, mac, ip, inventario_id FROM midia_screenshot_requests
       WHERE status = 'pendente'
       ORDER BY requested_at
       LIMIT 20`
  );
  return NextResponse.json({ ok: true, requests: r.rows });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (b.secret !== SECRET) return NextResponse.json({ ok: false, error: "secret inválido" }, { status: 401 });
  const id = String(b.id ?? "");
  const status = String(b.status ?? "");
  if (!id || !["capturado", "falha"].includes(status)) return NextResponse.json({ ok: false, error: "params inválidos" }, { status: 400 });
  await db().query(
    `UPDATE midia_screenshot_requests SET status = $1, done_at = NOW(), erro = $2 WHERE id = $3`,
    [status, b.erro ?? null, id]
  );
  return NextResponse.json({ ok: true });
}
