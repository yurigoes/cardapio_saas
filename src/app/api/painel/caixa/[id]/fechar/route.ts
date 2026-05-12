/**
 * POST /api/painel/caixa/[id]/fechar
 *   body: { valor_fechamento: number, observacoes_fechamento?: string }
 *
 * Calcula valor_esperado (abertura + reforços + vendas-em-dinheiro - sangrias - estornos),
 * salva diferenca = valor_fechamento - valor_esperado,
 * marca status='fechado' e fechado_em=NOW().
 *
 * Tudo em transação para evitar leitura inconsistente.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { transaction } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, badRequest, notFound, forbidden, serverError } from "@/lib/utils/response";

const bodySchema = z.object({
  valor_fechamento:       z.number().min(0).max(9999999.99),
  observacoes_fechamento: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, sub: usuarioId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "caixa:fechar")) return forbidden();

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
    const result = await transaction(async (client) => {
      const caixa = await client.query<{
        id:             string;
        valor_abertura: string;
        status:         string;
      }>(
        `SELECT id, valor_abertura, status
         FROM caixas
         WHERE id = $1 AND empresa_id = $2
         FOR UPDATE`,
        [params.id, empresaId]
      ).then(r => r.rows[0]);

      if (!caixa)                    return { error: "not_found", message: "Caixa não encontrado" };
      if (caixa.status !== "aberto") return { error: "already_closed", message: "Caixa já está fechado" };

      // Calcula totais por tipo
      const totals = await client.query<{ tipo: string; total: string }>(
        `SELECT tipo, COALESCE(SUM(valor), 0) AS total
         FROM caixa_movimentos
         WHERE caixa_id = $1
         GROUP BY tipo`,
        [params.id]
      ).then(r => r.rows);

      const sumByTipo = (t: string) =>
        Number(totals.find(r => r.tipo === t)?.total ?? 0);

      // Vendas em dinheiro especificamente
      const vendasDinheiro = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(valor), 0) AS total
         FROM caixa_movimentos
         WHERE caixa_id = $1 AND tipo = 'venda' AND forma_pagamento = 'dinheiro'`,
        [params.id]
      ).then(r => Number(r.rows[0]?.total ?? 0));

      const reforcos = sumByTipo("reforco");
      const sangrias = sumByTipo("sangria");
      const estornos = sumByTipo("estorno");

      const valorEsperado = Math.round(
        (Number(caixa.valor_abertura) + reforcos + vendasDinheiro - sangrias - estornos) * 100
      ) / 100;

      const diferenca = Math.round((body.valor_fechamento - valorEsperado) * 100) / 100;

      await client.query(
        `UPDATE caixas SET
           status                 = 'fechado',
           usuario_fechamento_id  = $1,
           valor_fechamento       = $2,
           valor_esperado         = $3,
           diferenca              = $4,
           observacoes_fechamento = $5,
           fechado_em             = NOW(),
           updated_at             = NOW()
         WHERE id = $6 AND empresa_id = $7`,
        [
          usuarioId,
          body.valor_fechamento,
          valorEsperado,
          diferenca,
          body.observacoes_fechamento ?? null,
          params.id,
          empresaId,
        ]
      );

      return {
        ok:               true,
        valor_esperado:   valorEsperado,
        valor_fechamento: body.valor_fechamento,
        diferenca,
        vendas_dinheiro:  vendasDinheiro,
        reforcos,
        sangrias,
        estornos,
      };
    });

    if ("error" in result) {
      switch (result.error) {
        case "not_found":      return notFound(result.message);
        case "already_closed": return badRequest(result.message);
        default:               return serverError(result.message);
      }
    }

    return ok(result);
  } catch (err) {
    console.error("[Caixa/Fechar]", err);
    return serverError();
  }
}
