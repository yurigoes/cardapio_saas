/**
 * GET  /api/admin/simulador-config — config do simulador (admin)
 * PUT  /api/admin/simulador-config — atualiza (master)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { parseDuracoes } from "@/lib/simulador";

export const dynamic = "force-dynamic";

async function lerConfig() {
  await ensureSchema();
  const r = await db().query(
    `SELECT preco_segundo, min_insercoes_dia, min_dias, min_valor, duracoes_seg, ativo
       FROM midia_simulador_config WHERE id = 1`
  ).then(r => r.rows[0]);
  return {
    preco_segundo: Number(r?.preco_segundo ?? 0.05),
    min_insercoes_dia: Number(r?.min_insercoes_dia ?? 50),
    min_dias: Number(r?.min_dias ?? 7),
    min_valor: Number(r?.min_valor ?? 100),
    duracoes_seg: parseDuracoes(r?.duracoes_seg),
    ativo: r?.ativo ?? true,
  };
}

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  return NextResponse.json({ ok: true, config: await lerConfig() });
}

const schema = z.object({
  preco_segundo: z.coerce.number().min(0),
  min_insercoes_dia: z.coerce.number().int().min(1),
  min_dias: z.coerce.number().int().min(1),
  min_valor: z.coerce.number().min(0),
  duracoes_seg: z.string().min(1),  // csv
  ativo: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  // normaliza csv de duracoes
  const dur = parseDuracoes(b.duracoes_seg).join(",");
  await ensureSchema();
  await db().query(
    `UPDATE midia_simulador_config
        SET preco_segundo = $1, min_insercoes_dia = $2, min_dias = $3,
            min_valor = $4, duracoes_seg = $5, ativo = $6, updated_at = NOW()
      WHERE id = 1`,
    [b.preco_segundo, b.min_insercoes_dia, b.min_dias, b.min_valor, dur, b.ativo ?? true]
  );
  return NextResponse.json({ ok: true, config: await lerConfig() });
}
