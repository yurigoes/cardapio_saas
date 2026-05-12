/**
 * POST /api/pedidos/[id]/reabrir
 *   body opcional: { motivo?: string, status_destino?: "pendente"|"confirmado" }
 *
 * Reabre um pedido que foi cancelado. Regras:
 *   - Pedido precisa estar em status 'cancelado'
 *   - Cancelado há no máximo 24h (proteção contra estorno indevido em
 *     histórico antigo). Configurável via param ?force=1 para admin.
 *   - Status destino default: "confirmado" (estado seguro mais comum)
 *   - Audit log obrigatório com motivo
 *
 * NÃO desfaz automaticamente:
 *   - Movimento de estorno no caixa (operador deve registrar reforço se aplicável)
 *   - Estoque retornado (item já foi consumido fisicamente provavelmente)
 *
 * Justificativa: a reabertura é exceção rara. Forçar reconciliação manual
 * dos efeitos colaterais é mais seguro do que reverter automaticamente.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { transaction } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { auditLog } from "@/lib/security/audit";
import { ok, badRequest, notFound, forbidden, serverError } from "@/lib/utils/response";

const bodySchema = z.object({
  motivo:         z.string().min(3).max(500),
  status_destino: z.enum(["pendente", "confirmado"]).optional().default("confirmado"),
});

const PRAZO_HORAS = 24;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  // Apenas admin/gerente reabrem (operação sensível)
  if (!temPermissao(role, "pedido:editar") || (role !== "master" && role !== "admin" && role !== "gerente")) {
    return forbidden("Apenas administradores podem reabrir pedidos cancelados");
  }

  let body: z.output<typeof bodySchema>;
  try {
    const r = bodySchema.safeParse(await req.json());
    if (!r.success) {
      return badRequest(r.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "));
    }
    body = r.data;
  } catch {
    return badRequest("Motivo é obrigatório (mínimo 3 caracteres)");
  }

  const force = req.nextUrl.searchParams.get("force") === "1";

  try {
    const result = await transaction(async (client) => {
      const pedido = await client.query<{
        id: string; status: string; numero: number;
        cancelado_em: string | null;
      }>(
        `SELECT id, status, numero, cancelado_em
         FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [params.id, empresaId]
      ).then(r => r.rows[0]);

      if (!pedido) return { error: "not_found" as const };
      if (pedido.status !== "cancelado") return { error: "not_canceled" as const, status: pedido.status };

      // Janela de tempo (a menos que force)
      if (!force && pedido.cancelado_em) {
        const horasDesdeCancel = (Date.now() - new Date(pedido.cancelado_em).getTime()) / 3_600_000;
        if (horasDesdeCancel > PRAZO_HORAS) {
          return { error: "expired" as const, horas: Math.floor(horasDesdeCancel) };
        }
      }

      await client.query(
        `UPDATE pedidos SET
           status               = $1,
           cancelado_em         = NULL,
           motivo_cancelamento  = NULL,
           updated_at           = NOW()
         WHERE id = $2 AND empresa_id = $3`,
        [body.status_destino, params.id, empresaId]
      );

      return { ok: true, numero: pedido.numero, status_anterior: pedido.status };
    });

    if ("error" in result) {
      switch (result.error) {
        case "not_found":    return notFound("Pedido não encontrado");
        case "not_canceled": return badRequest(`Pedido está em "${result.status}" — só é possível reabrir cancelados`);
        case "expired":      return badRequest(
          `Pedido cancelado há ${result.horas}h — limite de ${PRAZO_HORAS}h. Use ?force=1 se for admin master.`
        );
      }
    }

    await auditLog({
      acao:           "pedido:reabrir",
      recurso:        "pedidos",
      recursoId:      params.id,
      dadosAnteriores: { status: "cancelado" },
      dadosNovos:      { status: body.status_destino, motivo: body.motivo, force },
      usuario:        { sub: auth.payload.sub, empresaId },
    });

    return ok(result);
  } catch (err) {
    console.error("[Pedidos/Reabrir]", err);
    return serverError();
  }
}
