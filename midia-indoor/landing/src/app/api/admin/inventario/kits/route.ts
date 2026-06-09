/**
 * GET    /api/admin/inventario/kits — lista todos os kits com itens + valor total + depreciação
 * POST   /api/admin/inventario/kits — cria kit { nome, local_id?, vida_util_anos?, observacao?, itens: [{descricao, quantidade, valor_unit, inventario_id?, comprado_em?}] }
 * PATCH  /api/admin/inventario/kits — { id, nome?, local_id?, vida_util_anos?, observacao?, ativo? }
 * DELETE /api/admin/inventario/kits?id=...
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

interface KitRow {
  id: string; nome: string; local_id: string | null; local_nome: string | null;
  vida_util_anos: number; observacao: string | null; ativo: boolean; created_at: string;
}
interface ItemKitRow {
  id: string; kit_id: string; inventario_id: string | null;
  descricao: string; quantidade: number; valor_unit: string; comprado_em: string | null;
}

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const kits = await db().query<KitRow>(
    `SELECT k.*, l.nome AS local_nome FROM midia_inventario_kits k
       LEFT JOIN midia_locais l ON l.id = k.local_id
      ORDER BY k.ativo DESC, k.nome`
  ).then(r => r.rows);
  const itens = await db().query<ItemKitRow>(
    `SELECT * FROM midia_inventario_kit_itens ORDER BY descricao`
  ).then(r => r.rows);

  const kitsCom = kits.map(k => {
    const meus = itens.filter(i => i.kit_id === k.id);
    const valor_total = meus.reduce((s, i) => s + Number(i.valor_unit) * i.quantidade, 0);
    // Depreciação linear: divide valor_total pelos meses de vida util
    const meses_vida = Math.max(1, (k.vida_util_anos ?? 5) * 12);
    const dep_mensal = valor_total / meses_vida;
    const inicio = meus.map(i => i.comprado_em).filter(Boolean).sort()[0] ?? k.created_at;
    const meses_uso = inicio ? Math.max(0, Math.round((Date.now() - new Date(inicio).getTime()) / (1000*60*60*24*30))) : 0;
    const valor_residual = Math.max(0, valor_total - (dep_mensal * meses_uso));
    return { ...k, itens: meus, valor_total, dep_mensal, meses_uso, valor_residual };
  });

  return NextResponse.json({ ok: true, kits: kitsCom });
}

const itemSchema = z.object({
  descricao: z.string().min(1).max(120),
  quantidade: z.coerce.number().int().min(1).default(1),
  valor_unit: z.coerce.number().min(0).default(0),
  inventario_id: z.string().uuid().optional().nullable(),
  comprado_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const kitSchema = z.object({
  nome: z.string().min(1).max(120),
  local_id: z.string().uuid().optional().nullable(),
  vida_util_anos: z.coerce.number().int().min(1).max(20).default(5),
  observacao: z.string().max(500).optional(),
  itens: z.array(itemSchema).default([]),
});

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = kitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  await ensureSchema();

  const r = await db().query<{ id: string }>(
    `INSERT INTO midia_inventario_kits (nome, local_id, vida_util_anos, observacao) VALUES ($1,$2,$3,$4) RETURNING id`,
    [b.nome, b.local_id ?? null, b.vida_util_anos, b.observacao ?? null]
  );
  const kitId = r.rows[0].id;
  for (const it of b.itens) {
    await db().query(
      `INSERT INTO midia_inventario_kit_itens (kit_id, inventario_id, descricao, quantidade, valor_unit, comprado_em)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [kitId, it.inventario_id ?? null, it.descricao, it.quantidade, it.valor_unit, it.comprado_em ?? null]
    );
  }
  logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "kit.criar", entidade: "kit", entidade_id: kitId, detalhes: { nome: b.nome, itens: b.itens.length } });
  return NextResponse.json({ ok: true, id: kitId });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().min(1).max(120).optional(),
  local_id: z.string().uuid().optional().nullable(),
  vida_util_anos: z.coerce.number().int().min(1).max(20).optional(),
  observacao: z.string().max(500).optional(),
  ativo: z.boolean().optional(),
  itens: z.array(itemSchema).optional(),
});

export async function PATCH(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  for (const k of ["nome", "local_id", "vida_util_anos", "observacao", "ativo"] as const)
    if (b[k] !== undefined) add(k, b[k] === "" ? null : b[k]);
  if (sets.length) {
    vals.push(b.id);
    await db().query(`UPDATE midia_inventario_kits SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  }
  if (b.itens) {
    // Recria itens (mais simples que diff)
    await db().query(`DELETE FROM midia_inventario_kit_itens WHERE kit_id = $1`, [b.id]);
    for (const it of b.itens) {
      await db().query(
        `INSERT INTO midia_inventario_kit_itens (kit_id, inventario_id, descricao, quantidade, valor_unit, comprado_em)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [b.id, it.inventario_id ?? null, it.descricao, it.quantidade, it.valor_unit, it.comprado_em ?? null]
      );
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 });
  await db().query(`DELETE FROM midia_inventario_kits WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
