/**
 * POST/GET /api/pagamento/webhook
 * Recebe notificações do Mercado Pago (IPN/Webhook).
 *
 * Pro tipo "preapproval", consultamos o status na API do MP. Se autorizada,
 * ativamos a assinatura e provisionamos a conta no Xibo (idempotente).
 *
 * O MP manda o id de várias formas dependendo da config:
 *   ?type=preapproval&data.id=xxx   (querystring)
 *   body { type, data: { id } }     (json)
 * Tratamos ambos. Sempre respondemos 200 rápido (senão o MP reenvia).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { consultarPreApproval } from "@/lib/mercadopago";
import { provisionarConta } from "@/lib/provisionar";

async function processar(preapprovalId: string): Promise<void> {
  const info = await consultarPreApproval(preapprovalId);
  // external_reference = id da assinatura (gravado na criação)
  const assinaturaId = info.external_reference;

  await ensureSchema();
  const p = db();

  // Localiza assinatura por external_reference OU por gateway_ref
  const assin = await p.query<{ id: string; conta_id: string; status: string }>(
    `SELECT id, conta_id, status
       FROM midia_assinaturas
      WHERE id = $1 OR gateway_ref = $2
      LIMIT 1`,
    [assinaturaId ?? "00000000-0000-0000-0000-000000000000", preapprovalId]
  ).then(r => r.rows[0]);

  if (!assin) {
    console.warn("[webhook] assinatura não encontrada", { preapprovalId, assinaturaId });
    return;
  }

  // status MP: authorized | paused | cancelled | pending
  if (info.status === "authorized") {
    if (assin.status !== "ativa") {
      await p.query(
        `UPDATE midia_assinaturas
            SET status = 'ativa', gateway = 'mercadopago', gateway_ref = $1,
                ativada_em = NOW(), proximo_venc = (NOW() + INTERVAL '1 month')::date, updated_at = NOW()
          WHERE id = $2`,
        [preapprovalId, assin.id]
      );
    }
    // Provisiona no Xibo (cria folder + display group; idempotente)
    const r = await provisionarConta(assin.conta_id);
    if (!r.ok) console.error("[webhook] provisionamento falhou", r.erro);
  } else if (info.status === "cancelled") {
    await p.query(
      `UPDATE midia_assinaturas SET status = 'cancelada', updated_at = NOW() WHERE id = $1`,
      [assin.id]
    );
    await p.query(
      `UPDATE midia_contas SET status = 'cancelado', updated_at = NOW() WHERE id = $1`,
      [assin.conta_id]
    );
  } else if (info.status === "paused") {
    await p.query(
      `UPDATE midia_assinaturas SET status = 'inadimplente', updated_at = NOW() WHERE id = $1`,
      [assin.id]
    );
  }
}

function extrairId(req: NextRequest, body?: Record<string, unknown>): { tipo: string; id: string } | null {
  const url = req.nextUrl;
  const tipo = url.searchParams.get("type") ?? url.searchParams.get("topic")
            ?? (body?.type as string) ?? (body?.topic as string) ?? "";
  const id = url.searchParams.get("data.id") ?? url.searchParams.get("id")
          ?? ((body?.data as { id?: string } | undefined)?.id)
          ?? (body?.id as string | undefined)
          ?? "";
  if (!id) return null;
  return { tipo, id: String(id) };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* MP às vezes manda vazio */ }

  const info = extrairId(req, body);
  if (!info) return NextResponse.json({ ok: true }); // ack sem nada pra fazer

  // Só nos importam eventos de preapproval (assinatura)
  if (info.tipo.includes("preapproval") || info.tipo === "") {
    try {
      await processar(info.id);
    } catch (err) {
      console.error("[webhook] erro ao processar", err);
      // Mesmo em erro respondemos 200 pra não floodar reenvio; reprocessável manualmente.
    }
  }
  return NextResponse.json({ ok: true });
}

// MP pode validar o endpoint via GET
export async function GET(req: NextRequest) {
  const info = extrairId(req);
  if (info && info.tipo.includes("preapproval")) {
    try { await processar(info.id); } catch (err) { console.error("[webhook GET]", err); }
  }
  return NextResponse.json({ ok: true });
}
