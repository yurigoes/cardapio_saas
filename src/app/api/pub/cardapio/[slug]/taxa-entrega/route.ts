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
      whatsapp: string | null;
      delivery_aceita_fora_zona: boolean | null;
    }>(
      `SELECT id,
              COALESCE(taxa_entrega, 0)    AS taxa_entrega,
              tempo_entrega_min,
              COALESCE(pedido_minimo, 0)   AS pedido_minimo,
              whatsapp,
              COALESCE(delivery_aceita_fora_zona, false) AS delivery_aceita_fora_zona
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
        whatsapp:      empresa.whatsapp,
        fallback:      false,
        atende:        true,
      });
    }

    // Sem zona match — verifica se aceita fora ou rejeita
    if (!empresa.delivery_aceita_fora_zona) {
      // Lista zonas cadastradas pra mostrar pro cliente
      const { query } = await import("@/lib/db/client");
      const zonas = await query<{ nome: string; bairro: string | null; cep_inicio: string | null; cep_fim: string | null }>(
        `SELECT nome, bairro, cep_inicio, cep_fim
           FROM zonas_entrega WHERE empresa_id = $1 AND ativo = true
          ORDER BY nome LIMIT 20`,
        [empresa.id]
      ).catch(() => []);
      return ok({
        atende:        false,
        whatsapp:      empresa.whatsapp,
        zonas_cobertas: zonas,
        mensagem:      cep || bairro
          ? "Não atendemos delivery na sua região. Entre em contato pelo WhatsApp ou retire no balcão."
          : "Informe CEP ou bairro pra consultar entrega.",
      });
    }

    // Aceita fora de zona — usa taxa genérica
    return ok({
      taxa:          Number(empresa.taxa_entrega),
      tempo_min:     empresa.tempo_entrega_min,
      zona_nome:     null,
      pedido_minimo: Number(empresa.pedido_minimo),
      whatsapp:      empresa.whatsapp,
      fallback:      true,
      atende:        true,
    });
  } catch (err) {
    console.error("[Pub/TaxaEntrega]", err);
    return serverError();
  }
}
