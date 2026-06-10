/**
 * GET /api/admin/locais/capacidade-batch?ids=uuid1,uuid2,...
 *
 * Retorna a capacidade resumida de varios locais em UMA requisicao
 * (evita N chamadas separadas no dropdown de selecao de locais).
 *
 * Resposta:
 *   { ok: true, locais: { [id]: { ocupacao_pct, seg_disp, cabem_10s, cabem_15s, cabem_30s } } }
 */
import { NextRequest, NextResponse } from "next/server";
import { autenticarAdmin } from "@/lib/admin-auth";
import { autenticar } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const isAdmin = await autenticarAdmin(req).catch(() => false);
  const isAnunciante = !isAdmin && Boolean(await autenticar(req).catch(() => null));
  if (!isAdmin && !isAnunciante) return NextResponse.json({ ok: false, error: "nao autenticado" }, { status: 401 });

  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map(s => s.trim()).filter(s => /^[0-9a-f-]{36}$/i.test(s));
  if (!ids.length) return NextResponse.json({ ok: true, locais: {} });

  await ensureSchema();
  const parseHora = (s: string): number => {
    const [h, m] = (s || "06:00").split(":").map(n => parseInt(n, 10));
    return (h || 0) * 3600 + (m || 0) * 60;
  };

  // Locais com horario
  const locais = await db().query<{
    id: string; plano: string; abre: string; fecha: string; encarte_dur: number; paginas: number;
  }>(
    `SELECT l.id,
            COALESCE(l.plano_veiculacao, 'publicidade') AS plano,
            COALESCE(l.hora_abertura, '06:00') AS abre,
            COALESCE(l.hora_fechamento, '22:00') AS fecha,
            COALESCE(l.encarte_duracao_seg, 10) AS encarte_dur,
            (SELECT COUNT(*)::int FROM midia_encarte_paginas p WHERE p.local_id = l.id) AS paginas
       FROM midia_locais l
      WHERE l.id = ANY($1::uuid[])`,
    [ids]
  ).then(r => r.rows);

  // Soma de campanhas no_ar agrupado por local
  const camps = await db().query<{ local_id: string; insercoes_dia: number; segundos: number }>(
    `SELECT cl.local_id, c.insercoes_dia, c.segundos
       FROM midia_campanha_locais cl
       JOIN midia_campanhas c ON c.id = cl.campanha_id
      WHERE cl.local_id = ANY($1::uuid[]) AND c.status = 'no_ar'`,
    [ids]
  ).then(r => r.rows);

  // Gondola max por local (pra ponta_gondola)
  const gondolaDur = await db().query<{ local_id: string; d: number }>(
    `SELECT local_id, MAX(gondola_duracao_seg)::int AS d
       FROM midia_telas WHERE local_id = ANY($1::uuid[]) GROUP BY local_id`,
    [ids]
  ).then(r => r.rows.reduce((m, x) => { m[x.local_id] = x.d ?? 10; return m; }, {} as Record<string, number>));

  const out: Record<string, { ocupacao_pct: number; seg_disp: number; cabem_10s: number; cabem_15s: number; cabem_30s: number; plano: string; janela_h: number }> = {};
  for (const l of locais) {
    let janela = parseHora(l.fecha) - parseHora(l.abre);
    if (janela <= 0) janela = 24 * 3600 + janela;

    const extra = l.plano === "encarte_totem" ? l.paginas * l.encarte_dur
                : l.plano === "ponta_gondola" ? (gondolaDur[l.id] ?? 0)
                : 0;

    const ocupado = camps
      .filter(c => c.local_id === l.id)
      .reduce((s, c) => s + c.insercoes_dia * ((c.segundos > 0 ? c.segundos : 10) + extra), 0);
    const disp = Math.max(0, janela - ocupado);
    const pct = janela > 0 ? Math.round((ocupado / janela) * 100) : 0;

    out[l.id] = {
      plano: l.plano,
      janela_h: Math.round((janela / 3600) * 10) / 10,
      ocupacao_pct: pct,
      seg_disp: Math.round(disp),
      cabem_10s: Math.floor(disp / (10 + extra)),
      cabem_15s: Math.floor(disp / (15 + extra)),
      cabem_30s: Math.floor(disp / (30 + extra)),
    };
  }

  return NextResponse.json({ ok: true, locais: out });
}
