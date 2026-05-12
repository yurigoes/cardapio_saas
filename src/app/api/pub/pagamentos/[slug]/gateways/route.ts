/**
 * GET /api/pub/pagamentos/[slug]/gateways
 *
 * Retorna lista de gateways ativos para o público (totem/cardápio).
 * Não retorna credenciais — só nome, slug, padrão e métodos suportados.
 *
 * Resposta:
 *   { gateways: [{ slug, nome, padrao, metodos: ["pix", "credito", ...] }] }
 */
import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { ok, notFound, serverError } from "@/lib/utils/response";
import type { GatewaySlug, MetodoPagamento } from "@/lib/gateways/types";

// Métodos suportados por cada gateway. Pode evoluir para coluna no banco.
const GATEWAY_METODOS: Partial<Record<GatewaySlug, MetodoPagamento[]>> = {
  pix_bancario: ["pix"],
  mercadopago:  ["pix", "credito", "debito"],
  pagarme:      ["pix", "credito", "debito"],
  asaas:        ["pix", "credito", "debito", "boleto"],
  stone:        ["pix", "credito", "debito", "link"],
};

const GATEWAY_NOMES_DISPLAY: Partial<Record<GatewaySlug, string>> = {
  pix_bancario: "PIX Direto",
  mercadopago:  "Mercado Pago",
  pagarme:      "Pagar.me",
  asaas:        "Asaas",
  stone:        "Stone",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL AND status = 'ativo'`,
      [params.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const rows = await query<{
      slug:   string;
      nome:   string;
      padrao: boolean;
    }>(
      `SELECT slug, nome, padrao
       FROM gateways_config
       WHERE empresa_id = $1 AND ativo = TRUE AND deleted_at IS NULL
       ORDER BY padrao DESC, nome ASC`,
      [empresa.id]
    );

    const gateways = rows.map((g) => ({
      slug:    g.slug,
      nome:    GATEWAY_NOMES_DISPLAY[g.slug as GatewaySlug] ?? g.nome,
      padrao:  g.padrao,
      metodos: GATEWAY_METODOS[g.slug as GatewaySlug] ?? [],
    }));

    return ok({ gateways });
  } catch (err) {
    console.error("[Pub/Pagamentos/Gateways/GET]", err);
    return serverError();
  }
}
