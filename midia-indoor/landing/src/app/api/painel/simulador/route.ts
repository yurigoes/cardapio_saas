/**
 * GET /api/painel/simulador — config pública (pro anunciante simular no cliente)
 * Só expõe os campos necessários (preço/segundo + mínimos + durações).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";
import { parseDuracoes } from "@/lib/simulador";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const r = await db().query(
    `SELECT preco_segundo, min_insercoes_dia, min_dias, min_valor, duracoes_seg, ativo
       FROM midia_simulador_config WHERE id = 1`
  ).then(r => r.rows[0]);
  return NextResponse.json({
    ok: true,
    config: {
      preco_segundo: Number(r?.preco_segundo ?? 0.05),
      min_insercoes_dia: Number(r?.min_insercoes_dia ?? 50),
      min_dias: Number(r?.min_dias ?? 7),
      min_valor: Number(r?.min_valor ?? 100),
      duracoes_seg: parseDuracoes(r?.duracoes_seg),
      ativo: r?.ativo ?? true,
    },
  });
}
