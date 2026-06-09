/**
 * POST /api/painel/campanhas/[id]/cobrar-pix-mp
 * Cria pagamento PIX via Mercado Pago (com webhook automatico).
 * Resposta: { ok, payment_id, qr_code, qr_code_base64, ticket_url }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";
import { criarPixDireto } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();

  const camp = await db().query<{
    id: string; nome: string; valor: string; status_pagamento: string;
  }>(
    `SELECT id, nome, valor::text, status_pagamento FROM midia_campanhas WHERE id = $1 AND conta_id = $2`,
    [params.id, auth.sub]
  );
  const c = camp.rows[0];
  if (!c) return NextResponse.json({ ok: false, error: "Campanha não encontrada" }, { status: 404 });
  if (c.status_pagamento === "pago") return NextResponse.json({ ok: false, error: "Já paga" }, { status: 400 });
  if (c.status_pagamento === "isento") return NextResponse.json({ ok: false, error: "Isenta" }, { status: 400 });

  const valor = Number(c.valor || 0);
  if (valor <= 0) return NextResponse.json({ ok: false, error: "Valor inválido" }, { status: 400 });

  const conta = await db().query<{ nome: string; email: string }>(
    `SELECT nome, email FROM midia_contas WHERE id = $1`, [auth.sub]
  );
  const cust = conta.rows[0];
  if (!cust) return NextResponse.json({ ok: false, error: "Conta não encontrada" }, { status: 404 });

  try {
    const pix = await criarPixDireto({
      referencia: c.id,
      titulo: `Campanha: ${c.nome}`.slice(0, 100),
      valor,
      email: cust.email,
      nomePagador: cust.nome,
    });
    return NextResponse.json({ ok: true, ...pix });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
