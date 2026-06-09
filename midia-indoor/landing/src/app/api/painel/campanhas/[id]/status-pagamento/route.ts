/**
 * GET /api/painel/campanhas/[id]/status-pagamento
 * Front pollada esse endpoint a cada 3s pra detectar pagamento.
 * Faz pull "ativo": consulta InfinityPay diretamente se ainda tá pendente.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";
import { confirmarPagamento } from "@/app/api/webhooks/infinity-pay/route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();

  const camp = await db().query<{ id: string; status_pagamento: string }>(
    `SELECT id, status_pagamento FROM midia_campanhas WHERE id = $1 AND conta_id = $2`,
    [params.id, auth.sub]
  );
  const c = camp.rows[0];
  if (!c) return NextResponse.json({ ok: false, error: "Campanha não encontrada" }, { status: 404 });

  if (c.status_pagamento === "pago") return NextResponse.json({ ok: true, status: "pago" });

  // Tenta um pull ativo: se tem link pendente, consulta InfinityPay
  const link = await db().query<{ id: string }>(
    `SELECT id FROM midia_infinity_links WHERE campanha_id = $1 AND status = 'pendente' ORDER BY created_at DESC LIMIT 1`,
    [c.id]
  );
  if (link.rows[0]) {
    const r = await confirmarPagamento(link.rows[0].id, {}).catch(() => null);
    if (r?.paid) return NextResponse.json({ ok: true, status: "pago" });
  }

  return NextResponse.json({ ok: true, status: c.status_pagamento });
}
