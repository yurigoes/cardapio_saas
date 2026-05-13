/**
 * GET /api/pub/cardapio/[slug]/taxa-entrega?cep=00000000&bairro=Centro
 *
 * Retorna a taxa de entrega + tempo estimado para um endereço,
 * com base nas zonas cadastradas. Sem auth.
 *
 * Resposta: { taxa, tempo_min, zona_nome, fallback }
 *   - fallback=true → usa empresa.taxa_entrega genérica (zona não bate)
 *   - fallback=false → match exato por CEP ou bairro
 */
import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db/client";
import { ok, notFound, serverError } from "@/lib/utils/response";
import { EMPRESA_OPERACIONAL_SQL } from "@/lib/billing/empresa-acesso";
import { lookupZonaParaEndereco } from "@/lib/delivery/lookup-zona";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const sp     = req.nextUrl.searchParams;
  const cep    = sp.get("cep")    ?? undefined;
  const bairro = sp.get("bairro") ?? undefined;

  try {
    const empresa = await queryOne<{
      id: string;
      taxa_entrega: string;
      tempo_entrega_min: number | null;
      pedido_minimo: string;
    }>(
      `SELECT id,
              COALESCE(taxa_entrega, 0)    AS taxa_entrega,
              tempo_entrega_min,
              COALESCE(pedido_minimo, 0)   AS pedido_minimo
         FROM empresas
        WHERE slug = $1 AND deleted_at IS NULL AND ${EMPRESA_OPERACIONAL_SQL}`,
      [params.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const zona = await lookupZonaParaEndereco(empresa.id, { cep, bairro });

    if (zona) {
      return ok({
        taxa:          zona.valor_cobrado,
        tempo_min:     zona.tempo_min,
        zona_nome:     zona.nome,
        pedido_minimo: Number(empresa.pedido_minimo),
        fallback:      false,
      });
    }

    return ok({
      taxa:          Number(empresa.taxa_entrega),
      tempo_min:     empresa.tempo_entrega_min,
      zona_nome:     null,
      pedido_minimo: Number(empresa.pedido_minimo),
      fallback:      true,
    });
  } catch (err) {
    console.error("[Pub/TaxaEntrega]", err);
    return serverError();
  }
}
