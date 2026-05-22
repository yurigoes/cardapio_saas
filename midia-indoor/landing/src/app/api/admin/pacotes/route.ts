/**
 * GET   /api/admin/pacotes — lista pacotes
 * POST  /api/admin/pacotes — cria { nome, tipo, dias, insercoes_dia, segundos, preco, ordem }
 * PATCH /api/admin/pacotes — { id, ...campos, ativo? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const TIPOS = ["video", "banner_estatico", "banner_eletronico", "peca"] as const;

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    await ensureSchema();
    const rows = await db().query(
      `SELECT id, nome, tipo, dias, insercoes_dia, segundos, preco, ativo, ordem FROM midia_pacotes ORDER BY ordem, nome`
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, pacotes: rows });
  } catch (err) {
    console.error("[admin/pacotes GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const novo = z.object({
  nome: z.string().min(1).max(120),
  tipo: z.enum(TIPOS).default("video"),
  dias: z.coerce.number().int().min(1),
  insercoes_dia: z.coerce.number().int().min(1),
  segundos: z.coerce.number().int().min(1).max(300).default(10),
  preco: z.coerce.number().min(0).default(0),
  ordem: z.coerce.number().int().default(0),
});

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  try {
    await ensureSchema();
    const id = await db().query<{ id: string }>(
      `INSERT INTO midia_pacotes (nome, tipo, dias, insercoes_dia, segundos, preco, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [b.nome, b.tipo, b.dias, b.insercoes_dia, b.segundos, b.preco, b.ordem]
    ).then(r => r.rows[0].id);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[admin/pacotes POST]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const patch = z.object({
  id: z.string().uuid(),
  nome: z.string().min(1).max(120).optional(),
  tipo: z.enum(TIPOS).optional(),
  dias: z.coerce.number().int().min(1).optional(),
  insercoes_dia: z.coerce.number().int().min(1).optional(),
  segundos: z.coerce.number().int().min(1).max(300).optional(),
  preco: z.coerce.number().min(0).optional(),
  ativo: z.boolean().optional(),
  ordem: z.coerce.number().int().optional(),
});

export async function PATCH(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  for (const k of ["nome", "tipo", "dias", "insercoes_dia", "segundos", "preco", "ativo", "ordem"] as const)
    if (b[k] !== undefined) add(k, b[k]);
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });
  try {
    await ensureSchema();
    vals.push(b.id);
    await db().query(`UPDATE midia_pacotes SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/pacotes PATCH]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
