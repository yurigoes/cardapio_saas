/**
 * GET   /api/admin/contratos/templates — lista modelos
 * POST  /api/admin/contratos/templates — cria { titulo, conteudo_html }
 * PATCH /api/admin/contratos/templates — { id, titulo?, conteudo_html?, ativo? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster, autenticarAdmin } from "@/lib/admin-auth";
import { TEMPLATE_PADRAO } from "@/lib/contratos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    await ensureSchema();
    const rows = await db().query(
      `SELECT id, titulo, conteudo_html, versao, ativo, updated_at FROM midia_contrato_templates ORDER BY created_at`
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, templates: rows, modelo_padrao: TEMPLATE_PADRAO });
  } catch (err) {
    console.error("[contratos/templates GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const novo = z.object({ titulo: z.string().min(1).max(160), conteudo_html: z.string().min(1) });

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  try {
    await ensureSchema();
    const id = await db().query<{ id: string }>(
      `INSERT INTO midia_contrato_templates (titulo, conteudo_html) VALUES ($1,$2) RETURNING id`,
      [parsed.data.titulo, parsed.data.conteudo_html]
    ).then(r => r.rows[0].id);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[contratos/templates POST]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const patch = z.object({
  id: z.string().uuid(),
  titulo: z.string().min(1).max(160).optional(),
  conteudo_html: z.string().min(1).optional(),
  ativo: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;

  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  if (b.titulo        !== undefined) add("titulo", b.titulo);
  if (b.conteudo_html !== undefined) { add("conteudo_html", b.conteudo_html); sets.push("versao = versao + 1"); }
  if (b.ativo         !== undefined) add("ativo", b.ativo);
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });

  try {
    await ensureSchema();
    vals.push(b.id);
    await db().query(`UPDATE midia_contrato_templates SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contratos/templates PATCH]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
