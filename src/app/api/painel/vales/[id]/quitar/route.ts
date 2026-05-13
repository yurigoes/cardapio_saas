/**
 * POST /api/painel/vales/[id]/quitar
 *
 * Body: { valor, forma_pagamento, observacoes? }
 *   - valor: pode ser parcial (vai para status='parcial') ou integral (status='quitado')
 *   - forma_pagamento: pix | dinheiro | credito | debito | outro
 *
 * Transação:
 *   - INSERT vale_quitacoes
 *   - UPDATE vale.valor_quitado, status (parcial/quitado)
 *   - INSERT caixa_movimentos (tipo='venda', forma_pagamento) se houver caixa aberto
 *   - O trigger tg_vales_recalc_saldo recalcula clientes.saldo_vale_aberto
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { transaction } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError, conflict } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";
import type { PoolClient } from "pg";

const FORMAS = ["pix", "dinheiro", "credito", "debito", "outro"] as const;

const bodySchema = z.object({
  valor:           z.number().min(0.01).max(99999.99),
  forma_pagamento: z.enum(FORMAS),
  observacoes:     z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    const result = await transaction(async (client: PoolClient) => {
      const vale = await client.query<{
        id: string; status: string; valor: string; valor_quitado: string;
        cliente_id: string; pedido_id: string | null;
      }>(
        `SELECT id, status, valor, valor_quitado, cliente_id, pedido_id
           FROM vales
          WHERE id = $1 AND empresa_id = $2
          FOR UPDATE`,
        [params.id, empresaId]
      ).then(r => r.rows[0]);

      if (!vale) {
        const e: Error & { code?: string } = new Error("Vale não encontrado");
        e.code = "NOT_FOUND"; throw e;
      }
      if (vale.status === "quitado" || vale.status === "cancelado") {
        const e: Error & { code?: string } = new Error(`Vale já está ${vale.status}`);
        e.code = "CONFLICT"; throw e;
      }

      const restante = Number(vale.valor) - Number(vale.valor_quitado);
      if (body.valor > restante + 0.01) {
        const e: Error & { code?: string } = new Error(
          `Valor (R$ ${body.valor.toFixed(2)}) maior que o restante (R$ ${restante.toFixed(2)})`
        );
        e.code = "BAD_REQUEST"; throw e;
      }

      // Registra quitação
      await client.query(
        `INSERT INTO vale_quitacoes
           (vale_id, empresa_id, pedido_id, usuario_id, valor, forma_pagamento, observacoes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          vale.id, empresaId, vale.pedido_id, sub,
          body.valor, body.forma_pagamento,
          body.observacoes ?? null,
        ]
      );

      // Atualiza vale (e dispara trigger que recalcula saldo do cliente)
      const novoQuitado  = Number(vale.valor_quitado) + body.valor;
      const novoStatus   = Math.abs(novoQuitado - Number(vale.valor)) <= 0.01
                            ? "quitado" : "parcial";
      await client.query(
        `UPDATE vales SET valor_quitado = $1, status = $2, updated_at = NOW()
          WHERE id = $3`,
        [novoQuitado, novoStatus, vale.id]
      );

      // Lança em caixa se houver caixa aberto
      const caixa = await client.query<{ id: string }>(
        `SELECT id FROM caixas WHERE empresa_id = $1 AND status = 'aberto' LIMIT 1`,
        [empresaId]
      ).then(r => r.rows[0]).catch(() => null);

      if (caixa) {
        await client.query(
          `INSERT INTO caixa_movimentos
             (caixa_id, empresa_id, usuario_id, pedido_id, tipo,
              forma_pagamento, valor, descricao)
           VALUES ($1, $2, $3, $4, 'venda', $5, $6, $7)`,
          [
            caixa.id, empresaId, sub, vale.pedido_id,
            body.forma_pagamento, body.valor,
            `Quitação de vale #${vale.id.slice(0, 8)}`,
          ]
        );
      }

      return {
        vale_id:       vale.id,
        valor_quitado: novoQuitado,
        status:        novoStatus,
        caixa_lancado: !!caixa,
      };
    });

    await auditLog({
      acao:       "vale:quitar",
      recurso:    "vales",
      recursoId:  params.id,
      dadosNovos: body,
      usuario:    { sub, empresaId },
    });

    return ok(result);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === "NOT_FOUND")   return notFound(e.message);
    if (e.code === "CONFLICT")    return conflict(e.message);
    if (e.code === "BAD_REQUEST") return badRequest(e.message);
    console.error("[Vales/Quitar]", err);
    return serverError();
  }
}
