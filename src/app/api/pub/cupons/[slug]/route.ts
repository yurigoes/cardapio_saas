/**
 * GET /api/pub/cupons/[slug]?codigo=XYZ&total=12.5&cliente_id=...
 *
 * Valida um cupom para um pedido em construção (totem/cardápio público).
 * Não desconta nada nem aplica — só retorna se é válido e qual desconto.
 *
 * Resposta:
 *   { valido: true, desconto: 5.00, tipo: "percentual"|"fixo"|"frete_gratis", motivo?: string }
 */
import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db/client";
import { ok, badRequest, notFound, serverError } from "@/lib/utils/response";

interface CupomDb {
  id:                  string;
  codigo:              string;
  tipo:                string;          // percentual | fixo | frete_gratis
  valor:               string | number;
  valido_de:           string | null;
  valido_ate:          string | null;
  uso_maximo:          number | null;
  uso_atual:           number;
  uso_por_cliente:     number | null;
  valor_minimo_pedido: string | number | null;
  ativo:               boolean;
  cliente_id:          string | null;
  pontos_resgatados:   number | null;
}

function rejeita(motivo: string) {
  return ok({ valido: false, motivo });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const sp        = req.nextUrl.searchParams;
  const codigo    = sp.get("codigo")?.trim().toUpperCase();
  const totalRaw  = sp.get("total");
  const clienteId = sp.get("cliente_id");

  if (!codigo)   return badRequest("Parâmetro 'codigo' é obrigatório");
  if (!totalRaw) return badRequest("Parâmetro 'total' é obrigatório");

  const total = parseFloat(totalRaw);
  if (isNaN(total) || total <= 0) return badRequest("Total inválido");

  try {
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL AND status = 'ativo'`,
      [params.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const cupom = await queryOne<CupomDb>(
      `SELECT id, codigo, tipo, valor,
              valido_de, valido_ate,
              uso_maximo, uso_atual, uso_por_cliente,
              valor_minimo_pedido, ativo, cliente_id, pontos_resgatados
       FROM cupons
       WHERE empresa_id = $1 AND UPPER(codigo) = $2`,
      [empresa.id, codigo]
    );

    if (!cupom)         return rejeita("Cupom não encontrado");
    if (!cupom.ativo)   return rejeita("Cupom inativo");

    const agora = new Date();
    if (cupom.valido_de  && new Date(cupom.valido_de)  > agora) return rejeita("Cupom ainda não está vigente");
    if (cupom.valido_ate && new Date(cupom.valido_ate) < agora) return rejeita("Cupom expirado");

    if (cupom.uso_maximo != null && cupom.uso_atual >= cupom.uso_maximo) {
      return rejeita("Cupom esgotado");
    }

    if (cupom.cliente_id && cupom.cliente_id !== clienteId) {
      return rejeita("Cupom é exclusivo de outro cliente");
    }

    const valorMin = cupom.valor_minimo_pedido != null
      ? Number(cupom.valor_minimo_pedido)
      : 0;
    if (valorMin > 0 && total < valorMin) {
      return rejeita(`Valor mínimo do pedido: R$ ${valorMin.toFixed(2).replace(".", ",")}`);
    }

    // Verifica uso por cliente (se tiver cliente_id e limite por cliente)
    if (clienteId && cupom.uso_por_cliente != null && cupom.uso_por_cliente > 0) {
      const usadosPorCliente = await queryOne<{ count: string }>(
        `SELECT COUNT(*) FROM pedidos
         WHERE cliente_id = $1 AND empresa_id = $2 AND cupom_id = $3
           AND status NOT IN ('cancelado')`,
        [clienteId, empresa.id, cupom.id]
      ).catch(() => null); // tabela pode não ter cupom_id ainda

      const qtd = parseInt(usadosPorCliente?.count ?? "0", 10);
      if (qtd >= cupom.uso_por_cliente) {
        return rejeita(`Limite de ${cupom.uso_por_cliente} uso(s) por cliente atingido`);
      }
    }

    // Calcula desconto
    const valor = Number(cupom.valor);
    let desconto = 0;
    if (cupom.tipo === "percentual") {
      desconto = total * (valor / 100);
    } else if (cupom.tipo === "fixo") {
      desconto = Math.min(valor, total);
    } else if (cupom.tipo === "frete_gratis") {
      desconto = 0; // o desconto da frete será aplicado no checkout
    }

    return ok({
      valido:   true,
      cupom_id: cupom.id,
      codigo:   cupom.codigo,
      tipo:     cupom.tipo,
      valor:    valor,
      desconto: Math.round(desconto * 100) / 100,
    });
  } catch (err) {
    console.error("[Pub/Cupons/GET]", err);
    return serverError();
  }
}
