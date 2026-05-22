/**
 * PATCH  /api/admin/planos/[id] — edita campos do plano
 * DELETE /api/admin/planos/[id] — inativa (não apaga; preserva histórico)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster } from "@/lib/admin-auth";

const schema = z.object({
  nome:        z.string().min(1).max(80).optional(),
  preco:       z.coerce.number().min(0).optional(),
  telas_label: z.string().max(80).optional(),
  destaque:    z.boolean().optional(),
  recursos:    z.array(z.string()).optional(),
  ativo:       z.boolean().optional(),
  ordem:       z.coerce.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;

  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
  if (b.nome        !== undefined) add("nome", b.nome);
  if (b.preco       !== undefined) add("preco", b.preco);
  if (b.telas_label !== undefined) add("telas_label", b.telas_label);
  if (b.destaque    !== undefined) add("destaque", b.destaque);
  if (b.recursos    !== undefined) add("recursos", JSON.stringify(b.recursos));
  if (b.ativo       !== undefined) add("ativo", b.ativo);
  if (b.ordem       !== undefined) add("ordem", b.ordem);
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });

  try {
    await ensureSchema();
    vals.push(params.id);
    await db().query(`UPDATE midia_planos SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/planos PATCH]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  try {
    await ensureSchema();
    await db().query(`UPDATE midia_planos SET ativo = false, updated_at = NOW() WHERE id = $1`, [params.id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/planos DELETE]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
