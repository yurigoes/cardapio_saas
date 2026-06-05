/**
 * GET   /api/admin/campanhas/[id]  — detalhe + locais + relatório (proof-of-play)
 * PATCH /api/admin/campanhas/[id]  — edita período/valor/pagamento/status e locais
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { relatorioCampanha } from "@/lib/campanhas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    await ensureSchema();
    const p = db();
    const camp = await p.query(
      `SELECT c.*, ct.empresa, ct.nome AS anunciante, ct.email
         FROM midia_campanhas c JOIN midia_contas ct ON ct.id = c.conta_id WHERE c.id = $1`, [params.id]
    ).then(r => r.rows[0]);
    if (!camp) return NextResponse.json({ ok: false, error: "não encontrada" }, { status: 404 });

    const locais = await p.query(
      `SELECT l.id, l.nome, l.cidade FROM midia_campanha_locais cl JOIN midia_locais l ON l.id = cl.local_id WHERE cl.campanha_id = $1`,
      [params.id]
    ).then(r => r.rows);

    let relatorio = null;
    try { relatorio = await relatorioCampanha(params.id); } catch { /* sem stats ainda */ }

    return NextResponse.json({ ok: true, campanha: camp, locais, relatorio });
  } catch (err) {
    console.error("[admin/campanhas GET id]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const patch = z.object({
  nome: z.string().min(1).max(160).optional(),
  data_inicio: z.string().optional(),
  data_fim: z.string().optional(),
  valor: z.coerce.number().min(0).optional(),
  status_pagamento: z.enum(["pendente", "pago", "isento"]).optional(),
  status: z.enum(["rascunho", "aguardando_arte", "no_ar", "pausada", "encerrada"]).optional(),
  locais: z.array(z.string().uuid()).optional(),
  // specs editáveis (trocar pacote/parâmetros sem recriar a campanha)
  pacote_id: z.string().uuid().optional(),
  tipo: z.string().max(40).optional(),
  dias: z.coerce.number().int().min(1).optional(),
  insercoes_dia: z.coerce.number().int().min(1).optional(),
  segundos: z.coerce.number().int().min(1).max(300).optional(),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  hora_fim:    z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dias_semana: z.string().regex(/^([1-7],)*[1-7]$/).optional().or(z.literal("")),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = { ...parsed.data };

  try {
    await ensureSchema();
    const p = db();

    // Se trocou de pacote, herda as specs dele (a menos que venham sobrescritas no body)
    if (b.pacote_id) {
      const pac = await p.query<{ tipo: string; dias: number; insercoes_dia: number; segundos: number }>(
        `SELECT tipo, dias, insercoes_dia, segundos FROM midia_pacotes WHERE id = $1`, [b.pacote_id]
      ).then(r => r.rows[0]);
      if (pac) {
        b.tipo ??= pac.tipo; b.dias ??= pac.dias; b.insercoes_dia ??= pac.insercoes_dia; b.segundos ??= pac.segundos;
      }
    }

    const sets: string[] = []; const vals: unknown[] = [];
    const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
    for (const k of ["nome", "data_inicio", "data_fim", "valor", "status_pagamento", "status", "pacote_id", "tipo", "dias", "insercoes_dia", "segundos", "hora_inicio", "hora_fim", "dias_semana"] as const)
      if (b[k] !== undefined) add(k, b[k]);
    if (sets.length) {
      vals.push(params.id);
      await p.query(`UPDATE midia_campanhas SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
    }

    if (b.locais) {
      await p.query(`DELETE FROM midia_campanha_locais WHERE campanha_id = $1`, [params.id]);
      for (const localId of b.locais)
        await p.query(`INSERT INTO midia_campanha_locais (campanha_id, local_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [params.id, localId]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/campanhas PATCH]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
