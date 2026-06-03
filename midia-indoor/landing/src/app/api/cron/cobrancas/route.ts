/**
 * GET/POST /api/cron/cobrancas?key=CRON_SECRET
 * Roda 1x/dia. Para cada cobrança ativa cujo proximo_venc <= hoje,
 * gera uma fatura (mes corrente) se ainda não existir e empurra o próximo vencimento +1 mês.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Cob { id: string; conta_id: string; nome: string; valor_mensal: string; dia_vencimento: number; proximo_venc: string | null; }

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const provided = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key") ?? "";
  if (!secret || provided !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    await ensureSchema();
    const p = db();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const cobs = await p.query<Cob>(
      `SELECT id, conta_id, nome, valor_mensal, dia_vencimento, proximo_venc
         FROM midia_cobrancas_recorrentes
        WHERE ativo = true AND (proximo_venc IS NULL OR proximo_venc <= $1::date)`,
      [hoje.toISOString().slice(0, 10)]
    ).then(r => r.rows);

    let geradas = 0;
    for (const c of cobs) {
      const venc = c.proximo_venc ? new Date(c.proximo_venc) : hoje;
      const comp = `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, "0")}`;
      try {
        await p.query(
          `INSERT INTO midia_faturas (conta_id, cobranca_id, competencia, valor, vencimento, status) VALUES ($1,$2,$3,$4,$5,'aberta')`,
          [c.conta_id, c.id, comp, c.valor_mensal, venc.toISOString().slice(0, 10)]
        );
        geradas++;
      } catch { /* unique violation = fatura desse mês já existe */ }

      // Empurra próximo vencimento +1 mês
      const prox = new Date(venc); prox.setMonth(prox.getMonth() + 1);
      await p.query(`UPDATE midia_cobrancas_recorrentes SET proximo_venc = $1, ultimo_cobrado = $2 WHERE id = $3`,
        [prox.toISOString().slice(0, 10), venc.toISOString().slice(0, 10), c.id]);
    }
    return NextResponse.json({ ok: true, geradas, processadas: cobs.length });
  } catch (err) {
    console.error("[cron/cobrancas]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
