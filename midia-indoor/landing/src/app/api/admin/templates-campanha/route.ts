/**
 * GET    /api/admin/templates-campanha          — lista templates
 * POST   /api/admin/templates-campanha          — { nome, descricao?, formato, tipo?, dias?, insercoes_dia?, segundos?, hora_inicio?, hora_fim?, dias_semana?, valor? }
 * DELETE /api/admin/templates-campanha?id=...   — remove
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const rows = await db().query(`SELECT * FROM midia_campanha_templates ORDER BY nome`).then(r => r.rows);
  return NextResponse.json({ ok: true, templates: rows });
}

const novo = z.object({
  nome:          z.string().min(1).max(120),
  descricao:     z.string().max(500).optional(),
  formato:       z.enum(["simples", "encarte_totem", "encarte_gondola"]).default("simples"),
  tipo:          z.string().max(40).optional(),
  dias:          z.coerce.number().int().min(1).optional(),
  insercoes_dia: z.coerce.number().int().min(1).optional(),
  segundos:      z.coerce.number().int().min(1).max(300).optional(),
  hora_inicio:   z.string().regex(/^\d{2}:\d{2}$/).optional(),
  hora_fim:      z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dias_semana:   z.string().regex(/^([1-7],)*[1-7]$/).optional(),
  valor:         z.coerce.number().min(0).optional(),
});

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  await ensureSchema();
  const r = await db().query<{ id: string }>(
    `INSERT INTO midia_campanha_templates (nome, descricao, formato, tipo, dias, insercoes_dia, segundos, hora_inicio, hora_fim, dias_semana, valor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [b.nome, b.descricao ?? null, b.formato, b.tipo ?? null, b.dias ?? null, b.insercoes_dia ?? null, b.segundos ?? null, b.hora_inicio ?? null, b.hora_fim ?? null, b.dias_semana ?? null, b.valor ?? null]
  );
  return NextResponse.json({ ok: true, id: r.rows[0].id });
}

export async function DELETE(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 });
  await db().query(`DELETE FROM midia_campanha_templates WHERE id=$1`, [id]);
  return NextResponse.json({ ok: true });
}
