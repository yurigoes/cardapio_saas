/**
 * POST /api/painel/estoque/[produto_id]/movimento
 *   body: { tipo: "entrada"|"ajuste"|"perda", quantidade, motivo? }
 *
 * Registra movimento manual de estoque:
 *   - entrada: aporte de mercadoria (somar)
 *   - perda:    avaria/vencimento/quebra (subtrair)
 *   - ajuste:   correção (substitui o estoque pelo valor informado em quantidade)
 *
 * Saídas por venda são registradas automaticamente em /api/pedidos.
 *
 * Em transação para garantir snapshot correto de estoque_anterior/atual.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { transaction } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, badRequest, notFound, forbidden, serverError } from "@/lib/utils/response";

const bodySchema = z.object({
  tipo:       z.enum(["entrada", "ajuste", "perda"]),
  quantidade: z.number().int().min(1).max(999999),
  motivo:     z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { produto_id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, sub: usuarioId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "estoque:editar")) return forbidden();

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
    const result = await transaction(async (client) => {
      const produto = await client.query<{
        id: string; controla_estoque: boolean; estoque_atual: number | null;
      }>(
        `SELECT id, controla_estoque, estoque_atual
         FROM produtos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [params.produto_id, empresaId]
      ).then(r => r.rows[0]);

      if (!produto) return { error: "not_found" as const };

      const estoqueAnterior = produto.estoque_atual ?? 0;
      let estoqueAtual: number;

      if (body.tipo === "entrada") {
        estoqueAtual = estoqueAnterior + body.quantidade;
      } else if (body.tipo === "perda") {
        estoqueAtual = estoqueAnterior - body.quantidade;
      } else {
        // ajuste: quantidade é o NOVO valor absoluto
        estoqueAtual = body.quantidade;
      }

      // Garante que controla_estoque vire true (operador está movimentando)
      await client.query(
        `UPDATE produtos
           SET estoque_atual = $1, controla_estoque = TRUE, updated_at = NOW()
         WHERE id = $2 AND empresa_id = $3`,
        [estoqueAtual, params.produto_id, empresaId]
      );

      // Quantidade no log: para ajuste, registra delta absoluto
      const qtdLog = body.tipo === "ajuste"
        ? Math.abs(estoqueAtual - estoqueAnterior) || body.quantidade
        : body.quantidade;

      const mov = await client.query<{ id: string; criado_em: string }>(
        `INSERT INTO estoque_movimentos
           (empresa_id, produto_id, usuario_id, tipo, quantidade,
            estoque_anterior, estoque_atual, motivo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, criado_em`,
        [
          empresaId, params.produto_id, usuarioId,
          body.tipo, qtdLog,
          estoqueAnterior, estoqueAtual,
          body.motivo ?? null,
        ]
      ).then(r => r.rows[0]);

      return {
        ok: true,
        movimento_id:     mov.id,
        estoque_anterior: estoqueAnterior,
        estoque_atual:    estoqueAtual,
      };
    });

    if ("error" in result && result.error === "not_found") {
      return notFound("Produto não encontrado");
    }
    return ok(result);
  } catch (err) {
    console.error("[Estoque/Movimento]", err);
    return serverError();
  }
}
