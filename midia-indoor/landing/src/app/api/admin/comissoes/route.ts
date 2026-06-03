/**
 * GET   /api/admin/comissoes?afiliado_id=&status=
 * PATCH /api/admin/comissoes  — { id, status: "paga"|"cancelada" }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const af = req.nextUrl.searchParams.get("afiliado_id"); const st = req.nextUrl.searchParams.get("status");
  const w: string[] = []; const v: unknown[] = [];
  if (af) { v.push(af); w.push(`co.afiliado_id = $${v.length}`); }
  if (st) { v.push(st); w.push(`co.status = $${v.length}`); }
  const rows = await db().query(
    `SELECT co.*, a.nome AS afiliado, ct.empresa, c.nome AS campanha
       FROM midia_comissoes co
       JOIN midia_afiliados a ON a.id = co.afiliado_id
       JOIN midia_contas ct   ON ct.id = co.conta_id
  LEFT JOIN midia_campanhas c ON c.id = co.campanha_id
      ${w.length ? "WHERE " + w.join(" AND ") : ""}
      ORDER BY co.created_at DESC LIMIT 500`, v
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, comissoes: rows });
}

const patch = z.object({ id: z.string().uuid(), status: z.enum(["pendente", "paga", "cancelada"]) });

export async function PATCH(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  await db().query(
    `UPDATE midia_comissoes SET status = $1, pago_em = CASE WHEN $1 = 'paga' THEN NOW() ELSE NULL END WHERE id = $2`,
    [parsed.data.status, parsed.data.id]
  );
  return NextResponse.json({ ok: true });
}
