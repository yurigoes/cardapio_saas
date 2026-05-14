/**
 * POST /api/cron/lembretes-faturas
 *
 * Cron diário — envia lembretes de fatura em D-3, D-1 e D+1 do vencimento
 * pra mensalidades em aberto. Marker de envio evita duplicação.
 *
 * Também marca como 'atrasada' as que passaram do vencimento.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { enviarEmailFatura } from "@/lib/billing/mensalidades";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    let lembreteD3 = 0, lembreteD1 = 0, atrasoAviso = 0, marcadasAtrasadas = 0;

    // Marca atrasadas (venceram e ainda 'aberta')
    const atrasadas = await query<{ id: string }>(
      `UPDATE mensalidades
          SET status = 'atrasada', atualizado_em = NOW()
        WHERE status = 'aberta' AND vencimento < CURRENT_DATE
        RETURNING id`
    );
    marcadasAtrasadas = atrasadas.length;

    // D-3: vence em 3 dias
    const d3 = await query<{ id: string }>(
      `SELECT id FROM mensalidades
        WHERE status = 'aberta'
          AND vencimento = (CURRENT_DATE + INTERVAL '3 days')
          AND lembrete_d3_em IS NULL`
    );
    for (const m of d3) {
      const r = await enviarEmailFatura(m.id);
      if (r.ok) {
        await query(`UPDATE mensalidades SET lembrete_d3_em = NOW() WHERE id = $1`, [m.id]);
        lembreteD3++;
      }
    }

    // D-1: vence amanhã
    const d1 = await query<{ id: string }>(
      `SELECT id FROM mensalidades
        WHERE status = 'aberta'
          AND vencimento = (CURRENT_DATE + INTERVAL '1 day')
          AND lembrete_d1_em IS NULL`
    );
    for (const m of d1) {
      const r = await enviarEmailFatura(m.id);
      if (r.ok) {
        await query(`UPDATE mensalidades SET lembrete_d1_em = NOW() WHERE id = $1`, [m.id]);
        lembreteD1++;
      }
    }

    // D+1: venceu ontem (avisa atraso)
    const datrasos = await query<{ id: string }>(
      `SELECT id FROM mensalidades
        WHERE status = 'atrasada'
          AND vencimento = (CURRENT_DATE - INTERVAL '1 day')
          AND lembrete_atraso_em IS NULL`
    );
    for (const m of datrasos) {
      const r = await enviarEmailFatura(m.id);
      if (r.ok) {
        await query(`UPDATE mensalidades SET lembrete_atraso_em = NOW() WHERE id = $1`, [m.id]);
        atrasoAviso++;
      }
    }

    console.info(`[Cron/LembretesFaturas] D-3:${lembreteD3} D-1:${lembreteD1} D+1:${atrasoAviso} atrasadas:${marcadasAtrasadas}`);
    return NextResponse.json({ ok: true, lembreteD3, lembreteD1, atrasoAviso, marcadasAtrasadas });
  } catch (err) {
    console.error("[Cron/LembretesFaturas]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, cron: "lembretes-faturas" });
}
