/**
 * GET   /api/admin/cupons  — lista cupons
 * POST  /api/admin/cupons  — cria { codigo, tipo:pct|fixo, valor, validade?, max_usos? }
 * PATCH /api/admin/cupons  — { id, ativo?, valor?, validade?, max_usos? }
 *
 * Aplicação: na criação da campanha, o body aceita cupom_codigo; o sistema valida
 * e desconta o valor (mesma resposta) salvando cupom_id + desconto na campanha.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster, autenticarAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const rows = await db().query(
    `SELECT id, codigo, tipo, valor, validade, max_usos, usos, ativo, created_at FROM midia_cupons ORDER BY created_at DESC`
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, cupons: rows });
}

const novo = z.object({
  codigo:    z.string().min(2).max(40).transform(s => s.toUpperCase()),
  tipo:      z.enum(["pct", "fixo"]).default("pct"),
  valor:     z.coerce.number().min(0),
  validade:  z.string().optional().nullable(),
  max_usos:  z.coerce.number().int().min(1).optional().nullable(),
});

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  try {
    await ensureSchema();
    const id = await db().query<{ id: string }>(
      `INSERT INTO midia_cupons (codigo, tipo, valor, validade, max_usos) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [b.codigo, b.tipo, b.valor, b.validade ?? null, b.max_usos ?? null]
    ).then(r => r.rows[0].id);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const msg = err instanceof Error && err.message.includes("duplicate") ? "cupom com esse código já existe" : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

const patch = z.object({
  id:       z.string().uuid(),
  ativo:    z.boolean().optional(),
  valor:    z.coerce.number().min(0).optional(),
  validade: z.string().optional().nullable(),
  max_usos: z.coerce.number().int().min(1).optional().nullable(),
});

export async function PATCH(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  for (const k of ["ativo", "valor", "validade", "max_usos"] as const) if (b[k] !== undefined) add(k, b[k]);
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });
  await ensureSchema(); vals.push(b.id);
  await db().query(`UPDATE midia_cupons SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}
