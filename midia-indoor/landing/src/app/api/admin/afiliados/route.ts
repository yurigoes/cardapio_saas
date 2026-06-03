/**
 * GET   /api/admin/afiliados  — lista afiliados + indicações + comissão acumulada
 * POST  /api/admin/afiliados  — cria { nome, email, whatsapp?, codigo, comissao_pct, pix_chave? }
 * PATCH /api/admin/afiliados  — { id, ativo?|comissao_pct?|pix_chave? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const rows = await db().query(
    `SELECT a.*,
            (SELECT COUNT(*) FROM midia_contas      ct WHERE ct.afiliado_id = a.id)                                 AS indicados,
            (SELECT COALESCE(SUM(valor),0) FROM midia_comissoes co WHERE co.afiliado_id = a.id)                     AS comissao_total,
            (SELECT COALESCE(SUM(valor),0) FROM midia_comissoes co WHERE co.afiliado_id = a.id AND co.status='paga') AS comissao_paga,
            (SELECT COALESCE(SUM(valor),0) FROM midia_comissoes co WHERE co.afiliado_id = a.id AND co.status='pendente') AS comissao_pendente
       FROM midia_afiliados a ORDER BY a.created_at DESC`
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, afiliados: rows });
}

const novo = z.object({
  nome:         z.string().min(2).max(120),
  email:        z.string().email().toLowerCase(),
  whatsapp:     z.string().max(20).optional(),
  codigo:       z.string().min(3).max(20).regex(/^[A-Z0-9_-]+$/i, "letras/números"),
  comissao_pct: z.coerce.number().min(0).max(50).default(10),
  pix_chave:    z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data; await ensureSchema();
  try {
    const r = await db().query<{ id: string }>(
      `INSERT INTO midia_afiliados (nome, email, whatsapp, codigo, comissao_pct, pix_chave) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [b.nome, b.email, b.whatsapp ?? null, b.codigo.toUpperCase(), b.comissao_pct, b.pix_chave ?? null]
    );
    return NextResponse.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    const msg = err instanceof Error && err.message.includes("duplicate") ? "código ou e-mail já em uso" : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

const patch = z.object({
  id:           z.string().uuid(),
  ativo:        z.boolean().optional(),
  comissao_pct: z.coerce.number().min(0).max(50).optional(),
  pix_chave:    z.string().max(120).optional(),
});

export async function PATCH(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  if (b.ativo        !== undefined) add("ativo",        b.ativo);
  if (b.comissao_pct !== undefined) add("comissao_pct", b.comissao_pct);
  if (b.pix_chave    !== undefined) add("pix_chave",    b.pix_chave);
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });
  vals.push(b.id);
  await db().query(`UPDATE midia_afiliados SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}
