/**
 * POST /api/pub/cliente/[id]/resgatar
 *   body: { cupom_id: uuid, slug: empresa-slug }
 *
 * Cliente troca pontos por um cupom personalizado:
 *   1. Verifica saldo de pontos
 *   2. Verifica se o cupom-template é válido (pontos_resgatados > 0, ativo)
 *   3. Debita pontos do cliente
 *   4. Clona o cupom como personal: cliente_id, novo código, uso_maximo=1
 *   5. Retorna o cupom gerado
 *
 * Tudo dentro de uma transação para garantir atomicidade.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { queryOne, transaction } from "@/lib/db/client";
import { ok, badRequest, notFound, forbidden, conflict, serverError } from "@/lib/utils/response";
import type { PoolClient } from "pg";

const bodySchema = z.object({
  cupom_id: z.string().uuid("cupom_id inválido"),
  slug:     z.string().min(1, "slug é obrigatório"),
});

function gerarCodigoResgate(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem caracteres ambíguos
  const seg = (n: number) => Array.from({ length: n }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `RGT-${seg(6)}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: z.output<typeof bodySchema>;
  try {
    const raw = await req.json();
    const r   = bodySchema.safeParse(raw);
    if (!r.success) {
      return badRequest(r.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "));
    }
    body = r.data;
  } catch {
    return badRequest("JSON inválido");
  }

  try {
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL AND status = 'ativo'`,
      [body.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const result = await transaction(async (client: PoolClient) => {
      // ── Lock do cliente para evitar race condition de double-spend
      const cliente = await client.query<{ id: string; pontos: number }>(
        `SELECT id, pontos FROM clientes
         WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [params.id, empresa.id]
      ).then(r => r.rows[0]);

      if (!cliente) return { error: "not_found", message: "Cliente não encontrado" };

      // ── Cupom-template
      const template = await client.query<{
        id:                  string;
        codigo:              string;
        descricao:           string | null;
        tipo:                string;
        valor:               string;
        uso_por_cliente:     number | null;
        valor_minimo_pedido: string | null;
        valido_ate:          string | null;
        pontos_resgatados:   number | null;
        ativo:               boolean;
        cliente_id:          string | null;
      }>(
        `SELECT id, codigo, descricao, tipo, valor, uso_por_cliente,
                valor_minimo_pedido, valido_ate, pontos_resgatados, ativo, cliente_id
         FROM cupons
         WHERE id = $1 AND empresa_id = $2`,
        [body.cupom_id, empresa.id]
      ).then(r => r.rows[0]);

      if (!template)            return { error: "not_found", message: "Cupom não encontrado" };
      if (!template.ativo)      return { error: "inactive",  message: "Cupom inativo" };
      if (template.cliente_id)  return { error: "personal",  message: "Cupom já é personalizado" };
      if (template.pontos_resgatados == null || template.pontos_resgatados <= 0) {
        return { error: "not_redeemable", message: "Cupom não é resgatável por pontos" };
      }
      if (template.valido_ate && new Date(template.valido_ate) < new Date()) {
        return { error: "expired", message: "Cupom expirado" };
      }

      // ── Saldo
      const custo = Number(template.pontos_resgatados);
      if (Number(cliente.pontos) < custo) {
        return {
          error: "insufficient_points",
          message: `Saldo insuficiente. Faltam ${custo - Number(cliente.pontos)} pts`,
        };
      }

      // ── Debita pontos
      await client.query(
        `UPDATE clientes
         SET pontos = pontos - $1, updated_at = NOW()
         WHERE id = $2`,
        [custo, cliente.id]
      );

      // ── Gera código único (até 5 tentativas para evitar colisão)
      let novoCodigo = "";
      for (let i = 0; i < 5; i++) {
        const tentativa = gerarCodigoResgate();
        const existe = await client.query(
          `SELECT 1 FROM cupons WHERE empresa_id = $1 AND UPPER(codigo) = UPPER($2)`,
          [empresa.id, tentativa]
        ).then(r => r.rows[0]);
        if (!existe) { novoCodigo = tentativa; break; }
      }
      if (!novoCodigo) {
        return { error: "code_generation_failed", message: "Não foi possível gerar código único" };
      }

      // ── Validade: 30 dias ou herda do template (o que for menor)
      const validadePadrao = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const validadeFinal = template.valido_ate
        ? (new Date(template.valido_ate) < validadePadrao ? template.valido_ate : validadePadrao.toISOString())
        : validadePadrao.toISOString();

      // ── Clona como cupom personalizado
      const novoCupom = await client.query<{ id: string }>(
        `INSERT INTO cupons
           (empresa_id, codigo, descricao, tipo, valor,
            uso_maximo, uso_atual, uso_por_cliente,
            valor_minimo_pedido, valido_de, valido_ate,
            cliente_id, pontos_resgatados, ativo)
         VALUES ($1, $2, $3, $4, $5,
                 1, 0, 1,
                 $6, NOW(), $7,
                 $8, NULL, true)
         RETURNING id`,
        [
          empresa.id,
          novoCodigo,
          template.descricao ?? `Resgate de ${template.codigo}`,
          template.tipo,
          template.valor,
          template.valor_minimo_pedido,
          validadeFinal,
          cliente.id,
        ]
      ).then(r => r.rows[0]);

      return {
        ok: true,
        cupom: {
          id:        novoCupom.id,
          codigo:    novoCodigo,
          tipo:      template.tipo,
          valor:     Number(template.valor),
          validade:  validadeFinal,
        },
        pontos_debitados: custo,
        pontos_restantes: Number(cliente.pontos) - custo,
      };
    });

    if ("error" in result) {
      switch (result.error) {
        case "not_found":            return notFound(result.message);
        case "inactive":             return badRequest(result.message);
        case "personal":             return conflict(result.message);
        case "not_redeemable":       return badRequest(result.message);
        case "expired":              return badRequest(result.message);
        case "insufficient_points":  return forbidden(result.message);
        case "code_generation_failed": return serverError(result.message);
        default:                     return serverError(result.message ?? "Erro");
      }
    }

    return ok(result);
  } catch (err) {
    console.error("[Pub/Cliente/Resgatar/POST]", err);
    return serverError();
  }
}
