/**
 * GET/POST /api/cron/encerrar-vencidas?key=CRON_SECRET
 * Encerra campanhas no ar cujo período acabou (data_fim < hoje):
 * remove a Ad Campaign do Xibo e envia o relatório final por e-mail.
 * Agende um cron diário batendo nesta URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { encerrarCampanha } from "@/lib/campanhas";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || key !== secret) return NextResponse.json({ ok: false, error: "não autorizado" }, { status: 401 });

  try {
    await ensureSchema();
    const vencidas = await db().query<{ id: string; nome: string }>(
      `SELECT id, nome FROM midia_campanhas WHERE status = 'no_ar' AND data_fim IS NOT NULL AND data_fim < CURRENT_DATE`
    ).then(r => r.rows);

    const resultados: { id: string; nome: string; ok: boolean; erro?: string }[] = [];
    for (const c of vencidas) {
      const r = await encerrarCampanha(c.id);
      resultados.push({ id: c.id, nome: c.nome, ok: r.ok, erro: r.erro });
    }
    return NextResponse.json({ ok: true, encerradas: resultados.filter(r => r.ok).length, total: vencidas.length, resultados });
  } catch (err) {
    console.error("[cron/encerrar-vencidas]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
