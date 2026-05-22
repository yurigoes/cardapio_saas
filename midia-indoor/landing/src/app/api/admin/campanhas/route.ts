/**
 * GET  /api/admin/campanhas       — lista campanhas (com anunciante)
 * POST /api/admin/campanhas       — cria campanha (rascunho) a partir de pacote ou custom
 *   body: { conta_id, nome, pacote_id?, tipo?, dias?, insercoes_dia?, segundos?,
 *           data_inicio?, data_fim?, valor?, locais: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const status = req.nextUrl.searchParams.get("status")?.trim();
  try {
    await ensureSchema();
    const vals: unknown[] = []; let where = "";
    if (status) { vals.push(status); where = `WHERE c.status = $1`; }
    const rows = await db().query(
      `SELECT c.id, c.nome, c.tipo, c.dias, c.insercoes_dia, c.segundos, c.data_inicio, c.data_fim,
              c.valor, c.status, c.status_pagamento, c.xibo_campaign_id, c.arte_nome, c.created_at,
              ct.empresa, ct.nome AS anunciante,
              (SELECT COUNT(*) FROM midia_campanha_locais cl WHERE cl.campanha_id = c.id) AS locais
         FROM midia_campanhas c JOIN midia_contas ct ON ct.id = c.conta_id
         ${where} ORDER BY c.created_at DESC LIMIT 300`, vals
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, campanhas: rows });
  } catch (err) {
    console.error("[admin/campanhas GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const novo = z.object({
  conta_id:      z.string().uuid(),
  nome:          z.string().min(1).max(160),
  pacote_id:     z.string().uuid().optional(),
  tipo:          z.string().max(40).optional(),
  dias:          z.coerce.number().int().min(1).optional(),
  insercoes_dia: z.coerce.number().int().min(1).optional(),
  segundos:      z.coerce.number().int().min(1).max(300).optional(),
  data_inicio:   z.string().optional(),
  data_fim:      z.string().optional(),
  valor:         z.coerce.number().min(0).default(0),
  locais:        z.array(z.string().uuid()).min(1, "escolha pelo menos um local"),
});

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;

  try {
    await ensureSchema();
    const p = db();

    // Resolve specs do pacote (se informado) — campos custom têm prioridade
    let tipo = b.tipo, dias = b.dias, ins = b.insercoes_dia, seg = b.segundos;
    if (b.pacote_id) {
      const pac = await p.query<{ tipo: string; dias: number; insercoes_dia: number; segundos: number }>(
        `SELECT tipo, dias, insercoes_dia, segundos FROM midia_pacotes WHERE id = $1`, [b.pacote_id]
      ).then(r => r.rows[0]);
      if (pac) { tipo ??= pac.tipo; dias ??= pac.dias; ins ??= pac.insercoes_dia; seg ??= pac.segundos; }
    }
    if (!dias || !ins) return NextResponse.json({ ok: false, error: "informe dias e inserções/dia (ou um pacote)" }, { status: 400 });

    const campId = await p.query<{ id: string }>(
      `INSERT INTO midia_campanhas (conta_id, pacote_id, nome, tipo, dias, insercoes_dia, segundos, data_inicio, data_fim, valor, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'rascunho') RETURNING id`,
      [b.conta_id, b.pacote_id ?? null, b.nome, tipo ?? "video", dias, ins, seg ?? 10, b.data_inicio ?? null, b.data_fim ?? null, b.valor]
    ).then(r => r.rows[0].id);

    for (const localId of b.locais) {
      await p.query(`INSERT INTO midia_campanha_locais (campanha_id, local_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [campId, localId]);
    }

    return NextResponse.json({ ok: true, id: campId });
  } catch (err) {
    console.error("[admin/campanhas POST]", err);
    return NextResponse.json({ ok: false, error: "erro ao criar" }, { status: 500 });
  }
}
