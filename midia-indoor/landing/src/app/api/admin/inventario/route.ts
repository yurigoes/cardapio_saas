/**
 * GET    /api/admin/inventario          — lista
 * POST   /api/admin/inventario          — cria (gera qr_token automaticamente)
 * PATCH  /api/admin/inventario          — { id, ...campos }
 * DELETE /api/admin/inventario?id=...   — exclui
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const rows = await db().query(
    `SELECT i.*, l.nome AS local_nome
       FROM midia_inventario i
       LEFT JOIN midia_locais l ON l.id = i.local_id
      ORDER BY i.tipo, i.nome`
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, itens: rows });
}

const novo = z.object({
  tipo:        z.enum(["box", "tv", "totem", "cabo", "fonte", "suporte", "outro"]).default("box"),
  nome:        z.string().min(1).max(120),
  mac:         z.string().max(20).optional(),
  serial:      z.string().max(80).optional(),
  fabricante:  z.string().max(80).optional(),
  modelo:      z.string().max(80).optional(),
  local_id:    z.string().uuid().optional(),
  xibo_display_id: z.coerce.number().int().optional(),
  valor:       z.coerce.number().min(0).optional(),
  comprado_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  garantia_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nota_fiscal: z.string().max(80).optional(),
  observacao:  z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  await ensureSchema();

  const token = crypto.randomBytes(6).toString("hex").toUpperCase(); // 12 chars

  const r = await db().query<{ id: string; qr_token: string }>(
    `INSERT INTO midia_inventario (tipo, nome, mac, serial, fabricante, modelo, local_id, xibo_display_id, qr_token, valor, comprado_em, garantia_ate, nota_fiscal, observacao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, qr_token`,
    [b.tipo, b.nome, b.mac?.toUpperCase() ?? null, b.serial ?? null, b.fabricante ?? null, b.modelo ?? null, b.local_id ?? null, b.xibo_display_id ?? null, token, b.valor ?? null, b.comprado_em ?? null, b.garantia_ate ?? null, b.nota_fiscal ?? null, b.observacao ?? null]
  );

  logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "inventario.criar", entidade: "inventario", entidade_id: r.rows[0].id, detalhes: { nome: b.nome, mac: b.mac } });
  return NextResponse.json({ ok: true, id: r.rows[0].id, qr_token: r.rows[0].qr_token });
}

const patch = z.object({
  id:              z.string().uuid(),
  tipo:            z.enum(["box", "tv", "totem", "cabo", "fonte", "suporte", "outro"]).optional(),
  nome:            z.string().min(1).max(120).optional(),
  mac:             z.string().max(20).optional().or(z.literal("")),
  serial:          z.string().max(80).optional().or(z.literal("")),
  fabricante:      z.string().max(80).optional().or(z.literal("")),
  modelo:          z.string().max(80).optional().or(z.literal("")),
  local_id:        z.string().uuid().optional().or(z.literal("")),
  xibo_display_id: z.coerce.number().int().optional(),
  valor:           z.coerce.number().min(0).optional(),
  observacao:      z.string().max(1000).optional().or(z.literal("")),
  ativo:           z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;

  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v === "" ? null : v); sets.push(`${c} = $${vals.length}`); };
  for (const k of ["tipo", "nome", "mac", "serial", "fabricante", "modelo", "local_id", "xibo_display_id", "valor", "observacao", "ativo"] as const)
    if (b[k] !== undefined) add(k, k === "mac" && b[k] ? String(b[k]).toUpperCase() : b[k]);
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });
  vals.push(b.id);
  await db().query(`UPDATE midia_inventario SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 });
  await db().query(`DELETE FROM midia_inventario WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
