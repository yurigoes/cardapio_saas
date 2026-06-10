/**
 * GET   /api/admin/inventario/os/[id]  — detalhe + movimentos
 * PATCH /api/admin/inventario/os/[id]  — atualizar status/atribuido
 *   Body: { status?, atribuido_a? } — pra mover entre Aberto/Em analise/Descartado
 * POST  /api/admin/inventario/os/[id]/resolver  — fecha com veredito
 *   Body: { veredito, veredito_obs?, custo_centavos?, substituido_por_id? }
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster, autenticarAdmin } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await autenticarAdmin(req))) return NextResponse.json({ ok: false, error: "nao autenticado" }, { status: 401 });
  await ensureSchema();
  const os = await db().query(
    `SELECT os.*, i.nome AS item_nome, i.tipo AS item_tipo, i.modelo AS item_modelo, i.mac AS item_mac, i.serial AS item_serial,
            i.local_id, l.nome AS local_nome, i.garantia_ate
       FROM midia_inventario_os os
       JOIN midia_inventario i ON i.id = os.inventario_id
  LEFT JOIN midia_locais l ON l.id = i.local_id
      WHERE os.id = $1`, [params.id]
  ).then(r => r.rows[0]);
  if (!os) return NextResponse.json({ ok: false, error: "OS nao encontrada" }, { status: 404 });

  const movs = await db().query(
    `SELECT * FROM midia_inventario_movimentos
      WHERE inventario_id = $1 ORDER BY criado_em DESC LIMIT 50`,
    [os.inventario_id]
  ).then(r => r.rows);

  // Candidatos pra substituicao (se for problema/queimado)
  const { candidatosSubstituicao } = await import("@/lib/inventario-os");
  const candidatos = await candidatosSubstituicao(os.inventario_id);

  return NextResponse.json({ ok: true, os, movimentos: movs, candidatos_substituicao: candidatos });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const body = await req.json().catch(() => null) as { status?: string; atribuido_a?: string } | null;
  if (!body) return NextResponse.json({ ok: false, error: "body invalido" }, { status: 400 });

  const sets: string[] = []; const vals: unknown[] = [];
  if (body.status && ["aberto","em_analise","resolvido","descartado"].includes(body.status)) {
    vals.push(body.status); sets.push(`status = $${vals.length}`);
  }
  if (body.atribuido_a !== undefined) { vals.push(body.atribuido_a); sets.push(`atribuido_a = $${vals.length}`); }
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada a atualizar" }, { status: 400 });

  vals.push(params.id);
  await db().query(`UPDATE midia_inventario_os SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}
