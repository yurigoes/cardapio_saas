/**
 * POST /api/painel/campanhas/[id]/reativar
 * Anunciante pede pra reativar uma campanha encerrada.
 * Cria nova cobrança InfinityPay + marca a campanha como 'pendente_reativacao'.
 * Após pagamento confirmado, fica 'aguardando_aprovacao' pro admin liberar.
 *
 * Body: { dias?: number } - dias desejados pra renovação (default = dias originais)
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

  const camp = await db().query<{
    id: string; nome: string; status: string; valor: string; dias: number; insercoes_dia: number; segundos: number;
  }>(
    `SELECT id, nome, status, valor::text, dias, insercoes_dia, segundos FROM midia_campanhas WHERE id = $1 AND conta_id = $2`,
    [params.id, auth.sub]
  );
  const c = camp.rows[0];
  if (!c) return NextResponse.json({ ok: false, error: "Campanha não encontrada" }, { status: 404 });
  if (!["encerrada", "pausada"].includes(c.status)) {
    return NextResponse.json({ ok: false, error: `Campanha em status '${c.status}' não pode ser reativada` }, { status: 400 });
  }

  const valor = Number(c.valor || 0);
  if (valor <= 0) return NextResponse.json({ ok: false, error: "Valor da campanha inválido pra reativação" }, { status: 400 });
  const centavos = Math.round(valor * 100);

  // Reaproveita link pendente de reativação se houver
  const existente = await db().query<{ id: string; url: string | null }>(
    `SELECT id, url FROM midia_infinity_links
       WHERE campanha_id = $1 AND status = 'pendente' AND url IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
    [c.id]
  );
  if (existente.rows[0]?.url) {
    return NextResponse.json({ ok: true, link: existente.rows[0].url, order_nsu: existente.rows[0].id, reaproveitado: true });
  }

  const rec = await db().query<{ id: string }>(
    `INSERT INTO midia_infinity_links (campanha_id, valor_centavos) VALUES ($1, $2) RETURNING id`,
    [c.id, centavos]
  );
  const orderNsu = rec.rows[0].id;

  // Reseta status: aguardando pagamento (após pago, vira aguardando aprovação do admin)
  await db().query(
    `UPDATE midia_campanhas SET status = 'rascunho', status_pagamento = 'pendente' WHERE id = $1`,
    [c.id]
  );

  const conta = await db().query<{ nome: string; email: string; whatsapp: string | null }>(
    `SELECT nome, email, whatsapp FROM midia_contas WHERE id = $1`, [auth.sub]
  );
  const cust = conta.rows[0];

  const dominio = process.env.DOMAIN || req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const base = `https://${dominio}`;

  const r = await criarLinkInfinityPay({
    items: [{ quantity: 1, price: centavos, description: `Reativação: ${c.nome}`.slice(0, 100) }],
    orderNsu,
    redirectUrl: `${base}/painel?paid=1`,
    webhookUrl: `${base}/api/webhooks/infinity-pay`,
    customer: cust ? { name: cust.nome, email: cust.email, phone_number: cust.whatsapp ?? undefined } : undefined,
  });
  const url = extrairUrlInfinityPay(r.body);
  const slug = (r.body as { slug?: string; invoice_slug?: string } | null)?.slug ?? (r.body as { invoice_slug?: string } | null)?.invoice_slug ?? null;

  if (!r.ok || !url) {
    await db().query(`UPDATE midia_infinity_links SET status='falha' WHERE id=$1`, [orderNsu]);
    return NextResponse.json({ ok: false, error: r.error ?? "Falha ao gerar link InfinityPay" }, { status: 500 });
  }

  await db().query(`UPDATE midia_infinity_links SET url=$1, slug=$2 WHERE id=$3`, [url, slug, orderNsu]);
  return NextResponse.json({ ok: true, link: url, order_nsu: orderNsu, slug });
}
