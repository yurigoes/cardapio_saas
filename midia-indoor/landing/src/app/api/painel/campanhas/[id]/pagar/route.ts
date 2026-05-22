/**
 * POST /api/painel/campanhas/[id]/pagar — gera (ou reaproveita) o link de pagamento
 * único da campanha (Mercado Pago Checkout Pro: PIX ou cartão).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";
import { criarPagamentoUnico } from "@/lib/mercadopago";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });

  try {
    await ensureSchema();
    const p = db();
    const camp = await p.query<{ id: string; nome: string; valor: string; status_pagamento: string }>(
      `SELECT id, nome, valor, status_pagamento FROM midia_campanhas WHERE id = $1 AND conta_id = $2`,
      [params.id, auth.sub]
    ).then(r => r.rows[0]);
    if (!camp) return NextResponse.json({ ok: false, error: "campanha não encontrada" }, { status: 404 });
    if (camp.status_pagamento === "pago") return NextResponse.json({ ok: false, error: "já está pago" }, { status: 409 });
    if (Number(camp.valor) <= 0) return NextResponse.json({ ok: false, error: "campanha sem valor definido" }, { status: 400 });

    // Reaproveita um pagamento pendente, se houver
    const pend = await p.query<{ id: string; init_point: string | null }>(
      `SELECT id, init_point FROM midia_pagamentos WHERE campanha_id = $1 AND status = 'pendente' ORDER BY created_at DESC LIMIT 1`,
      [params.id]
    ).then(r => r.rows[0]);
    if (pend?.init_point) return NextResponse.json({ ok: true, init_point: pend.init_point });

    // Cria registro de pagamento e a preference no MP (external_reference = pagamento_id)
    const pagId = await p.query<{ id: string }>(
      `INSERT INTO midia_pagamentos (campanha_id, valor) VALUES ($1,$2) RETURNING id`,
      [params.id, Number(camp.valor)]
    ).then(r => r.rows[0].id);

    const { id: prefId, init_point } = await criarPagamentoUnico({
      referencia: pagId,
      titulo: `Campanha: ${camp.nome}`,
      valor: Number(camp.valor),
      email: auth.email,
    });

    await p.query(`UPDATE midia_pagamentos SET gateway_ref = $1, init_point = $2 WHERE id = $3`, [prefId, init_point, pagId]);
    return NextResponse.json({ ok: true, init_point });
  } catch (err) {
    console.error("[painel/campanhas pagar]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
