/**
 * POST /api/pub/cliente/[id]/trocar-pontos
 *   body: { slug: string, pontos: number }
 *
 * Cliente troca uma quantidade arbitrária de pontos por um cupom de
 * valor fixo, calculado pela regra `empresa.real_por_ponto` (R$ por pt).
 *
 * Regras:
 *  - Fidelidade precisa estar ativa
 *  - `real_por_ponto` > 0
 *  - Cliente precisa ter saldo >= pontos solicitados
 *  - Mínimo de 1 ponto (ou o que valha pelo menos 1 centavo)
 *  - Cupom gerado: tipo "fixo", uso único, validade 30 dias, código RGT-XXXXXX
 *
 * Idempotência: cliente pode resgatar quantos cupons quiser, cada
 * chamada cria um cupom novo (sem template). Atomic (FOR UPDATE no cliente).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { queryOne, transaction } from "@/lib/db/client";
import { ok, badRequest, notFound, forbidden, serverError } from "@/lib/utils/response";
import type { PoolClient } from "pg";

const bodySchema = z.object({
  slug:   z.string().min(1, "slug é obrigatório"),
  pontos: z.coerce.number().int().min(1, "pontos deve ser ≥ 1"),
});

function gerarCodigoResgate(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
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
    const r = bodySchema.safeParse(await req.json());
    if (!r.success) {
      return badRequest(r.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "));
    }
    body = r.data;
  } catch {
    return badRequest("JSON inválido");
  }

  try {
    const empresa = await queryOne<{
      id: string; fidelidade_ativo: boolean | null; real_por_ponto: string | null;
    }>(
      `SELECT id, fidelidade_ativo, real_por_ponto
         FROM empresas
        WHERE slug = $1 AND deleted_at IS NULL AND status IN ('ativo','ativa','teste')`,
      [body.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");
    if (!empresa.fidelidade_ativo) return badRequest("Fidelidade desativada");

    const realPorPonto = Number(empresa.real_por_ponto ?? 0);
    if (!realPorPonto || realPorPonto <= 0) {
      return badRequest("Restaurante ainda não definiu a regra de troca (R$ por ponto)");
    }

    const valor = Number((body.pontos * realPorPonto).toFixed(2));
    if (valor <= 0) return badRequest("Quantidade de pontos insuficiente pra gerar 1 centavo");

    const result = await transaction(async (client: PoolClient) => {
      // Lock no cliente (pode estar atrelado à matriz se rede cross-filial)
      const cliente = await client.query<{ id: string; pontos: number; empresa_id: string }>(
        `SELECT id, pontos, empresa_id FROM clientes
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [params.id]
      ).then(r => r.rows[0]);

      if (!cliente) return { error: "not_found" as const };
      if (Number(cliente.pontos) < body.pontos) {
        return {
          error:   "insufficient" as const,
          message: `Saldo insuficiente. Você tem ${cliente.pontos} pts, tentou trocar ${body.pontos}`,
        };
      }

      // Debita
      await client.query(
        `UPDATE clientes
            SET pontos = pontos - $1, updated_at = NOW()
          WHERE id = $2`,
        [body.pontos, cliente.id]
      );

      // Gera código único
      let codigo = "";
      for (let i = 0; i < 6; i++) {
        const t = gerarCodigoResgate();
        const exists = await client.query(
          `SELECT 1 FROM cupons WHERE empresa_id = $1 AND UPPER(codigo) = UPPER($2)`,
          [empresa.id, t]
        ).then(r => r.rows[0]);
        if (!exists) { codigo = t; break; }
      }
      if (!codigo) return { error: "code_fail" as const };

      const validade = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const novo = await client.query<{ id: string }>(
        `INSERT INTO cupons
           (empresa_id, codigo, descricao, tipo, valor,
            uso_maximo, uso_atual, uso_por_cliente,
            valor_minimo_pedido, valido_de, valido_ate,
            cliente_id, pontos_resgatados, ativo)
         VALUES ($1, $2, $3, 'fixo', $4,
                 1, 0, 1,
                 NULL, NOW(), $5,
                 $6, $7, true)
         RETURNING id`,
        [
          empresa.id,
          codigo,
          `Resgate de ${body.pontos} pts`,
          valor.toFixed(2),
          validade,
          cliente.id,
          body.pontos,
        ]
      ).then(r => r.rows[0]);

      return {
        ok: true as const,
        cupom: { id: novo.id, codigo, valor, validade },
        pontos_debitados: body.pontos,
        pontos_restantes: Number(cliente.pontos) - body.pontos,
      };
    });

    if ("error" in result) {
      switch (result.error) {
        case "not_found":    return notFound("Cliente não encontrado");
        case "insufficient": return forbidden(result.message);
        case "code_fail":    return serverError("Não foi possível gerar código único");
      }
    }

    return ok(result);
  } catch (err) {
    console.error("[Pub/Cliente/TrocarPontos/POST]", err);
    return serverError();
  }
}
