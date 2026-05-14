/**
 * POST /api/pedidos/[id]/fechar
 *
 * Fecha um pedido com 1 ou mais pagamentos (divisão de conta).
 * Body: {
 *   pagamentos: [{ forma, valor, troco_para?, observacoes? }],
 *   marcar_entregue?: boolean (default true)  // libera mesa e fecha
 * }
 *
 * Regras:
 *   - Soma dos valores deve igualar pedidos.total (margem 0.01 para arredondamento)
 *   - Idempotência: rejeita se pedido já tem pagamentos registrados
 *   - Transação: insere todos pagamentos + atualiza status + libera mesa +
 *     gera 1 caixa_movimento por forma de pagamento
 *   - status final: 'entregue' (a menos que marcar_entregue=false)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { transaction } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError, conflict } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";
import { notificarEvolution } from "@/lib/notify/evolution";
import { dispatchCupomCliente } from "@/lib/print/dispatch";
import type { PoolClient } from "pg";

const FORMAS = ["pix", "dinheiro", "credito", "debito", "vale", "outro"] as const;

const pagamentoSchema = z.object({
  forma:       z.enum(FORMAS),
  valor:       z.preprocess(v => typeof v === "string" ? parseFloat(v) : v,
                            z.number().min(0.01).max(99999.99)),
  troco_para:  z.preprocess(v => typeof v === "string" ? parseFloat(v) : v,
                            z.number().min(0).max(99999.99).optional()),
  observacoes: z.string().max(500).optional(),
});

const bodySchema = z.object({
  pagamentos:       z.array(pagamentoSchema).min(1, "Informe ao menos 1 pagamento"),
  marcar_entregue:  z.boolean().optional().default(true),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "pedido:editar")) return forbidden("Sem permissão");

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    const result = await transaction(async (client: PoolClient) => {
      // 1. Carrega pedido com lock
      const pedido = await client.query<{
        id: string; status: string; total: string;
        mesa_id: string | null; numero: number | null;
        cliente_id: string | null;
        cliente_telefone: string | null;
        motoboy_id: string | null;
      }>(
        `SELECT id, status, total, mesa_id, numero, cliente_id, cliente_telefone, motoboy_id
           FROM pedidos
          WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
          FOR UPDATE`,
        [params.id, empresaId]
      ).then(r => r.rows[0]);

      if (!pedido) {
        const e: Error & { code?: string } = new Error("Pedido não encontrado");
        e.code = "NOT_FOUND";
        throw e;
      }

      // Motoboy só pode fechar pedidos atribuídos a ele
      // pedido.motoboy_id é FK pra motoboys.id, mas sub é usuarios.id —
      // precisamos resolver: motoboy_id IS NULL OK, ou achar motoboy do user
      if (role === "motoboy") {
        const motoboy = await client.query<{ id: string }>(
          `SELECT id FROM motoboys WHERE usuario_id = $1 AND empresa_id = $2 AND deleted_at IS NULL LIMIT 1`,
          [sub, empresaId]
        ).then(r => r.rows[0]);
        if (!motoboy || pedido.motoboy_id !== motoboy.id) {
          const e: Error & { code?: string } = new Error("Você só pode fechar pedidos atribuídos a você");
          e.code = "FORBIDDEN";
          throw e;
        }
      }

      if (pedido.status === "cancelado") {
        const e: Error & { code?: string } = new Error("Pedido cancelado não pode ser fechado");
        e.code = "CONFLICT";
        throw e;
      }

      // 2. Idempotência: já tem pagamentos?
      const existente = await client.query<{ qtd: string }>(
        `SELECT COUNT(*)::text AS qtd FROM pedido_pagamentos WHERE pedido_id = $1`,
        [params.id]
      ).then(r => r.rows[0]);

      if (Number(existente?.qtd ?? 0) > 0) {
        const e: Error & { code?: string } = new Error("Pedido já possui pagamentos registrados");
        e.code = "CONFLICT";
        throw e;
      }

      // 3. Valida soma
      const totalPedido = Number(pedido.total);
      const totalPago   = body.pagamentos.reduce((a, p) => a + p.valor, 0);
      const diff        = Math.abs(totalPago - totalPedido);

      if (diff > 0.02) {
        const e: Error & { code?: string } = new Error(
          `Soma dos pagamentos (R$ ${totalPago.toFixed(2)}) difere do total ` +
          `do pedido (R$ ${totalPedido.toFixed(2)}).`
        );
        e.code = "BAD_REQUEST";
        throw e;
      }

      // 3.5. Valida e prepara pagamentos com 'vale' (crediário)
      const valorVale = body.pagamentos
        .filter(p => p.forma === "vale")
        .reduce((a, p) => a + p.valor, 0);
      if (valorVale > 0) {
        if (!pedido.cliente_id) {
          const e: Error & { code?: string } = new Error(
            "Pagamento em vale requer cliente identificado no pedido"
          );
          e.code = "BAD_REQUEST";
          throw e;
        }
        const cli = await client.query<{
          limite_vale: string; saldo_vale_aberto: string;
        }>(
          `SELECT COALESCE(limite_vale, 0)       AS limite_vale,
                  COALESCE(saldo_vale_aberto, 0) AS saldo_vale_aberto
             FROM clientes WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
          [pedido.cliente_id, empresaId]
        ).then(r => r.rows[0]);
        const disponivel = Number(cli?.limite_vale ?? 0) - Number(cli?.saldo_vale_aberto ?? 0);
        if (valorVale > disponivel + 0.01) {
          const e: Error & { code?: string } = new Error(
            `Limite de vale insuficiente. Disponível: R$ ${disponivel.toFixed(2)}, ` +
            `solicitado: R$ ${valorVale.toFixed(2)}.`
          );
          e.code = "BAD_REQUEST";
          throw e;
        }
      }

      // 4. Insere pagamentos (e cria vale se forma='vale')
      for (const p of body.pagamentos) {
        await client.query(
          `INSERT INTO pedido_pagamentos
             (pedido_id, empresa_id, usuario_id, forma, valor, troco_para, observacoes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            params.id, empresaId, sub,
            p.forma, p.valor,
            p.troco_para ?? null,
            p.observacoes ?? null,
          ]
        );

        if (p.forma === "vale" && pedido.cliente_id) {
          await client.query(
            `INSERT INTO vales
               (empresa_id, cliente_id, pedido_id, usuario_id, valor, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              empresaId, pedido.cliente_id, params.id, sub,
              p.valor,
              p.observacoes ?? `Vale do pedido #${pedido.numero ?? params.id.slice(0, 8)}`,
            ]
          );
          // O trigger tg_vales_recalc_saldo atualiza clientes.saldo_vale_aberto
        }
      }

      // 5. Atualiza pedido + libera mesa
      const novoStatus = body.marcar_entregue ? "entregue" : pedido.status;
      await client.query(
        `UPDATE pedidos SET status = $1, updated_at = NOW() WHERE id = $2`,
        [novoStatus, params.id]
      );

      if (body.marcar_entregue && pedido.mesa_id) {
        await client.query(
          `UPDATE mesas SET status = 'livre', pedido_ativo_id = NULL WHERE id = $1`,
          [pedido.mesa_id]
        );
      }

      // 6. Movimenta caixa (1 movimento por forma)
      // Procura caixa aberto
      const caixa = await client.query<{ id: string }>(
        `SELECT id FROM caixas WHERE empresa_id = $1 AND status = 'aberto' LIMIT 1`,
        [empresaId]
      ).then(r => r.rows[0]).catch(() => null);

      if (caixa) {
        for (const p of body.pagamentos) {
          await client.query(
            `INSERT INTO caixa_movimentos
               (caixa_id, empresa_id, usuario_id, pedido_id, tipo,
                forma_pagamento, valor, descricao)
             VALUES ($1, $2, $3, $4, 'venda', $5, $6, $7)`,
            [
              caixa.id, empresaId, sub, params.id,
              p.forma, p.valor,
              `Venda · pedido #${pedido.numero ?? params.id.slice(0, 8)}`,
            ]
          );
        }
      }

      return {
        id: params.id,
        status: novoStatus,
        total: totalPedido,
        total_pago: totalPago,
        pagamentos_count: body.pagamentos.length,
        caixa_lancado: !!caixa,
        cliente_telefone: pedido.cliente_telefone,
        numero: pedido.numero,
      };
    });

    await auditLog({
      acao:       "pedido:fechar",
      recurso:    "pedidos",
      recursoId:  params.id,
      dadosNovos: {
        pagamentos: body.pagamentos.map(p => ({ forma: p.forma, valor: p.valor })),
        total:      result.total,
      },
      usuario:    { sub, empresaId },
    });

    // Notifica cliente que pedido foi entregue (best-effort)
    if (result.status === "entregue" && result.cliente_telefone) {
      notificarEvolution(empresaId, "pronto", {
        telefone:     result.cliente_telefone,
        pedidoNumero: result.numero,
        total:        result.total,
      }).catch(e => console.warn("[Pedidos/Fechar] notify:", e));
    }

    // Cupom do cliente para impressora do caixa/balcão (best-effort)
    const formaPrincipal = body.pagamentos
      .slice().sort((a, b) => b.valor - a.valor)[0]?.forma;
    dispatchCupomCliente(empresaId, params.id, formaPrincipal)
      .catch(e => console.warn("[Pedidos/Fechar] print:", e));

    return ok(result);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === "NOT_FOUND")   return notFound(e.message);
    if (e.code === "CONFLICT")    return conflict(e.message);
    if (e.code === "BAD_REQUEST") return badRequest(e.message);
    if (e.code === "FORBIDDEN")   return forbidden(e.message);
    console.error("[Pedidos/Fechar]", err);
    return serverError();
  }
}
