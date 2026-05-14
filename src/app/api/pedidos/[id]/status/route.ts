import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";
import { registrarVendaPedido, registrarEstornoPedido } from "@/lib/caixa/movimento";
import { enviarPushParaUsuariosDaEmpresa } from "@/lib/push";

const statusSchema = z.object({
  // 'preparo' é alias do frontend → normalizado para 'preparando' antes da query
  status: z.enum([
    "confirmado", "preparo", "preparando", "pronto", "entregue",
    "cancelado", "aguardando_pagamento", "pago",
  ]).transform(s => s === "preparo" ? "preparando" : s),
  motivo: z.string().max(500).optional(),
});

// Transições válidas de status
const VALID_TRANSITIONS: Record<string, string[]> = {
  pendente:              ["confirmado", "cancelado"],
  confirmado:            ["preparando", "cancelado"],
  preparo:               ["pronto", "cancelado"],
  preparando:            ["pronto", "cancelado"],
  pronto:                ["entregue", "cancelado"],
  aguardando_pagamento:  ["pago", "cancelado"],
  entregue:              ["pago"],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();

  if (!temPermissao(role, "pedido:editar")) return forbidden();

  let body: z.infer<typeof statusSchema>;
  try {
    body = statusSchema.parse(await req.json());
  } catch (err: unknown) {
    const msg = err instanceof z.ZodError ? err.errors[0]?.message : "Dados inválidos";
    return badRequest(msg ?? "Dados inválidos");
  }

  try {
    const pedido = await queryOne<{
      id: string; status: string; empresa_id: string;
      total: string; forma_pagamento: string | null;
    }>(
      `SELECT id, status, empresa_id, total, forma_pagamento
       FROM pedidos WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );

    if (!pedido) return notFound("Pedido");
    if (pedido.empresa_id !== empresaId) return forbidden("Pedido não pertence à sua empresa");

    // Valida transição
    const validNext = VALID_TRANSITIONS[pedido.status] || [];
    if (!validNext.includes(body.status)) {
      return badRequest(
        `Transição inválida: ${pedido.status} → ${body.status}. ` +
        `Transições válidas: ${validNext.join(", ")}`
      );
    }

    // Campos de timestamp por status
    const timestampField: Record<string, string> = {
      confirmado:  "aceito_em",
      preparando:  "preparando_em",
      pronto:      "pronto_em",
      entregue:    "entregue_em",
      cancelado:   "cancelado_em",
    };

    const tsField = timestampField[body.status];
    const tsClause = tsField ? `, ${tsField} = NOW()` : "";
    const cancelClause = body.status === "cancelado" && body.motivo
      ? `, motivo_cancelamento = $4`
      : "";

    const queryValues: unknown[] = [body.status, params.id, empresaId];
    if (body.status === "cancelado" && body.motivo) {
      queryValues.push(body.motivo);
    }

    await query(
      `UPDATE pedidos
       SET status = $1, updated_at = NOW()${tsClause}${cancelClause}
       WHERE id = $2 AND empresa_id = $3`,
      queryValues
    );

    await auditLog({
      acao:           "pedido:status",
      recurso:        "pedidos",
      recursoId:      params.id,
      dadosAnteriores: { status: pedido.status },
      dadosNovos:      { status: body.status },
      usuario:        { sub: auth.payload.sub, empresaId },
    });

    // ── Integração caixa ─────────────────────────────────────────────────
    // Regra:
    //   * Online (PIX/cartão online) → registra venda no momento "confirmado"
    //   * Presencial (dinheiro/cartão maquininha) → no momento "entregue"
    //   * Cancelamento de pedido pago → registra estorno
    const valor = Number(pedido.total);
    const forma = pedido.forma_pagamento;
    const isOnlinePayment = forma === "pix" || forma === "credito_online" || forma === "debito_online";
    const isPresencial    = forma === "dinheiro" || forma === "cartao" || forma === "credito" || forma === "debito";

    try {
      if (body.status === "confirmado" && isOnlinePayment) {
        await registrarVendaPedido(empresaId, params.id, valor, forma);
      }
      if (body.status === "entregue" && isPresencial) {
        await registrarVendaPedido(empresaId, params.id, valor, forma);
      }
      if (body.status === "cancelado") {
        // Só estorna se já estava em estado pago (confirmado/preparando/pronto/entregue)
        const eraPago = ["confirmado", "preparando", "pronto", "entregue"].includes(pedido.status);
        if (eraPago) {
          await registrarEstornoPedido(empresaId, params.id, valor, forma);
        }
      }
    } catch (e) {
      // Falha de caixa não deve bloquear a transição de status
      console.error("[Pedidos/Status/CaixaIntegration]", e);
    }

    // ── Web Push em transições relevantes ────────────────────────────────
    // Notifica os admins/operadores em estados acionáveis:
    //   confirmado → pedido aprovado, cozinha pode preparar
    //   preparo / em_preparo → atualização visual no KDS
    //   pronto     → pedido pode ser entregue/chamado
    //   entregue   → pedido finalizado
    //   cancelado  → atenção, pode ser estorno necessário
    type StatusKey = "confirmado" | "preparo" | "em_preparo" | "pronto" | "entregue" | "cancelado";
    const PUSH_CONFIGS: Record<StatusKey, { title: string; emoji: string }> = {
      confirmado: { title: "Pedido confirmado", emoji: "✓" },
      preparo:    { title: "Pedido em preparo", emoji: "👨‍🍳" },
      em_preparo: { title: "Pedido em preparo", emoji: "👨‍🍳" },
      pronto:     { title: "Pedido pronto",     emoji: "✅" },
      entregue:   { title: "Pedido entregue",   emoji: "🛵" },
      cancelado:  { title: "Pedido cancelado",  emoji: "⚠️" },
    };
    const cfg = PUSH_CONFIGS[body.status as StatusKey];
    if (cfg) {
      // pega numero do pedido para a mensagem
      const p = await queryOne<{ numero: number; cliente_nome: string | null }>(
        `SELECT numero, cliente_nome FROM pedidos WHERE id = $1`,
        [params.id]
      ).catch(() => null);
      enviarPushParaUsuariosDaEmpresa(empresaId, {
        title: `${cfg.emoji} ${cfg.title} #${p?.numero ?? ""}`,
        body:  p?.cliente_nome ? `Cliente: ${p.cliente_nome}` : `Pedido ${body.status}`,
        url:   `/painel/pedidos`,
        tag:   `pedido-${body.status}`,
      }).catch(e => console.warn("[Push] erro:", e));
    }

    return ok({ id: params.id, status: body.status });
  } catch (err) {
    console.error("[Pedidos/Status]", err);
    return serverError();
  }
}
