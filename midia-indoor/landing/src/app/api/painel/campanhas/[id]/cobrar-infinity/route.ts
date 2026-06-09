/**
 * POST /api/painel/campanhas/[id]/cobrar-infinity
 * Cria (ou reaproveita) um link de pagamento InfinityPay pra campanha.
 * Resposta: { ok, link, order_nsu, status }
 *
 * Reaproveita link pendente existente (idempotente).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";
import { criarLinkInfinityPay, extrairUrlInfinityPay } from "@/lib/infinity-pay";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();

  // Dono da campanha?
  const camp = await db().query<{
    id: string; nome: string; valor: string; status_pagamento: string;
  }>(
    `SELECT id, nome, valor::text, status_pagamento FROM midia_campanhas WHERE id = $1 AND conta_id = $2`,
    [params.id, auth.sub]
  );
  const c = camp.rows[0];
  if (!c) return NextResponse.json({ ok: false, error: "Campanha não encontrada" }, { status: 404 });
  if (c.status_pagamento === "pago") return NextResponse.json({ ok: false, error: "Campanha já está paga" }, { status: 400 });
  if (c.status_pagamento === "isento") return NextResponse.json({ ok: false, error: "Campanha isenta de pagamento" }, { status: 400 });

  const valor = Number(c.valor || 0);
  if (valor <= 0) return NextResponse.json({ ok: false, error: "Valor da campanha inválido" }, { status: 400 });
  const centavos = Math.round(valor * 100);

  // Reaproveita link pendente
  const existente = await db().query<{ id: string; url: string | null; slug: string | null }>(
    `SELECT id, url, slug FROM midia_infinity_links
       WHERE campanha_id = $1 AND status = 'pendente' AND url IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
    [c.id]
  );
  if (existente.rows[0]?.url) {
    return NextResponse.json({ ok: true, link: existente.rows[0].url, order_nsu: existente.rows[0].id, reaproveitado: true });
  }

  // Cria o registro local primeiro (order_nsu = nosso id)
  const rec = await db().query<{ id: string }>(
    `INSERT INTO midia_infinity_links (campanha_id, valor_centavos) VALUES ($1, $2) RETURNING id`,
    [c.id, centavos]
  );
  const orderNsu = rec.rows[0].id;

  // Pega dados do anunciante pra customer
  const conta = await db().query<{ nome: string; email: string; whatsapp: string | null }>(
    `SELECT nome, email, whatsapp FROM midia_contas WHERE id = $1`, [auth.sub]
  );
  const cust = conta.rows[0];

  const dominio = process.env.DOMAIN || req.nextUrl.host;
  const proto = req.nextUrl.protocol;

  const r = await criarLinkInfinityPay({
    items: [{ quantity: 1, price: centavos, description: `Campanha: ${c.nome}`.slice(0, 100) }],
    orderNsu,
    redirectUrl: `${proto}//${dominio}/painel?paid=1`,
    webhookUrl: `${proto}//${dominio}/api/webhooks/infinity-pay`,
    customer: cust ? { name: cust.nome, email: cust.email, phone_number: cust.whatsapp ?? undefined } : undefined,
  });
  const url = extrairUrlInfinityPay(r.body);
  const slug = (r.body as { slug?: string; invoice_slug?: string } | null)?.slug ?? (r.body as { invoice_slug?: string } | null)?.invoice_slug ?? null;

  if (!r.ok || !url) {
    await db().query(`UPDATE midia_infinity_links SET status='falha' WHERE id=$1`, [orderNsu]);
    return NextResponse.json({ ok: false, error: r.error ?? "Falha ao gerar link InfinityPay (sem URL)" }, { status: 500 });
  }

  await db().query(`UPDATE midia_infinity_links SET url=$1, slug=$2 WHERE id=$3`, [url, slug, orderNsu]);
  return NextResponse.json({ ok: true, link: url, order_nsu: orderNsu, slug });
}
