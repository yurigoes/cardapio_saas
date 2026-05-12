/**
 * POST /api/pub/pagamentos/[slug]
 *   Cria cobrança PIX (ou outro método) para um pedido já criado.
 *   Retorna pix_copia_cola e URL do QR code.
 *
 * GET /api/pub/pagamentos/[slug]?gateway_id=...
 *   Consulta status de um pagamento (polling).
 *
 * Rota pública — sem auth, identifica empresa pelo slug.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db/client";
import { getGateway } from "@/lib/gateways/registry";
import { ok, notFound, badRequest, serverError } from "@/lib/utils/response";
import { EMPRESA_OPERACIONAL_SQL } from "@/lib/billing/empresa-acesso";
import type { GatewaySlug } from "@/lib/gateways/types";

// ── GET — poll de status ────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const gatewayId  = req.nextUrl.searchParams.get("gateway_id");
  const gatewaySlug = req.nextUrl.searchParams.get("gateway") as GatewaySlug | null;

  if (!gatewayId) return badRequest("gateway_id é obrigatório");

  try {
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL AND ${EMPRESA_OPERACIONAL_SQL}`,
      [params.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const gateway = await getGateway(empresa.id, gatewaySlug ?? undefined);
    const result  = await gateway.consultar(gatewayId);

    return ok(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao consultar pagamento";
    console.error("[Pub/Pagamentos/GET]", err);
    return serverError(msg);
  }
}

// ── POST — criar cobrança ───────────────────────────────────────────────────

const cobrarSchema = z.object({
  pedido_id:      z.string().uuid("pedido_id inválido"),
  metodo:         z.enum(["pix", "credito", "debito", "dinheiro", "link"]).default("pix"),
  gateway:        z.string().optional(),          // slug do gateway; se omitido usa o padrão
  parcelas:       z.number().int().min(1).max(24).optional(),
  cliente_nome:   z.string().max(255).optional(),
  cliente_email:  z.string().email().optional(),
  cliente_cpf:    z.string().max(14).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  let body: z.output<typeof cobrarSchema>;
  try {
    const raw = await req.json();
    const r   = cobrarSchema.safeParse(raw);
    if (!r.success) {
      const msg = r.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return badRequest(msg);
    }
    body = r.data;
  } catch {
    return badRequest("JSON inválido");
  }

  try {
    // Empresa
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL AND ${EMPRESA_OPERACIONAL_SQL}`,
      [params.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    // Pedido
    const pedido = await queryOne<{
      id:            string;
      numero:        number;
      total:         string;
      cliente_nome:  string | null;
      empresa_id:    string;
    }>(
      `SELECT id, numero, total, cliente_nome, empresa_id
       FROM pedidos
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [body.pedido_id, empresa.id]
    );
    if (!pedido) return notFound("Pedido não encontrado");

    // Gateway
    const gateway = await getGateway(
      empresa.id,
      (body.gateway as GatewaySlug) ?? undefined
    );

    // Cria cobrança
    const cobranca = await gateway.cobrar({
      valor:         Number(pedido.total),
      metodo:        body.metodo as "pix",
      parcelas:      body.parcelas,
      descricao:     `Pedido #${pedido.numero}`,
      pedido_id:     pedido.id,
      cliente_nome:  body.cliente_nome  ?? pedido.cliente_nome ?? undefined,
      cliente_email: body.cliente_email ?? undefined,
      cliente_cpf:   body.cliente_cpf   ?? undefined,
    });

    // Salva na tabela de pagamentos (se existir) — ignora erro silenciosamente
    try {
      await queryOne(
        `INSERT INTO pagamentos
           (empresa_id, pedido_id, gateway_slug, gateway_id,
            metodo, status, valor, gateway_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          empresa.id,
          pedido.id,
          gateway.slug,
          cobranca.gateway_id,
          body.metodo,
          cobranca.status,
          Number(pedido.total),
          JSON.stringify(cobranca.gateway_data),
        ]
      );
    } catch { /* tabela pode não existir ainda */ }

    return ok({
      gateway_id:     cobranca.gateway_id,
      gateway:        gateway.slug,
      status:         cobranca.status,
      metodo:         cobranca.metodo,
      valor:          cobranca.valor,
      pix_copia_cola: cobranca.pix_copia_cola,
      pix_qrcode_url: cobranca.pix_qrcode_url,
      link_pagamento: cobranca.link_pagamento,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar cobrança";
    console.error("[Pub/Pagamentos/POST]", err);
    return serverError(msg);
  }
}
