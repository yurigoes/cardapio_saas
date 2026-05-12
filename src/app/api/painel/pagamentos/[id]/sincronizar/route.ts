/**
 * POST /api/painel/pagamentos/[id]/sincronizar?force=1
 *
 * Consulta o gateway externo, atualiza estado local e re-dispara
 * efeitos colaterais que normalmente seriam feitos pelo webhook
 * (caixa + push + audit).
 *
 * Default: só faz updates se o status mudou.
 * ?force=1: re-dispara efeitos mesmo se status já está igual,
 *           útil quando webhook chegou mas processamento interno falhou
 *           (push não enviado, caixa não registrado por bug, etc).
 *
 * Idempotente em todos os efeitos (caixa, audit não duplica).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";
import { getGateway } from "@/lib/gateways/registry";
import { registrarVendaPedido } from "@/lib/caixa/movimento";
import { enviarPushParaUsuariosDaEmpresa } from "@/lib/push";
import { auditLog } from "@/lib/security/audit";
import type { GatewaySlug } from "@/lib/gateways/types";

const NOMES_GATEWAY: Record<string, string> = {
  mercadopago: "Mercado Pago",
  pagarme:     "Pagar.me",
  asaas:       "Asaas",
  stone:       "Stone",
  pix_bancario: "PIX Direto",
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "financeiro:editar")) return forbidden();

  const force = req.nextUrl.searchParams.get("force") === "1";

  try {
    const pagamento = await queryOne<{
      id: string; gateway_slug: string; gateway_id: string;
      pedido_id: string | null; status: string; valor: string;
    }>(
      `SELECT id, gateway_slug, gateway_id, pedido_id, status, valor
       FROM pagamentos WHERE id = $1 AND empresa_id = $2`,
      [params.id, empresaId]
    );
    if (!pagamento) return notFound("Pagamento não encontrado");

    // Consulta o gateway externo
    const gw = await getGateway(empresaId, pagamento.gateway_slug as GatewaySlug);
    const remoto = await gw.consultar(pagamento.gateway_id);

    const statusRemoto = remoto.status;
    const mudouStatus  = statusRemoto !== pagamento.status;

    // Atualiza pagamento se status mudou
    if (mudouStatus) {
      await queryOne(
        `UPDATE pagamentos
           SET status = $1, gateway_data = $2::jsonb, updated_at = NOW()
         WHERE id = $3`,
        [statusRemoto, JSON.stringify(remoto.gateway_data), pagamento.id]
      );
    }

    // Re-dispara efeitos colaterais se aprovado E (mudou OU force)
    let pedidoConfirmado = false;
    let vendaRegistrada  = false;
    let pushEnviado      = false;
    if (statusRemoto === "aprovado" && pagamento.pedido_id && (mudouStatus || force)) {
      // Pedido → confirmado
      const upd = await queryOne<{ id: string }>(
        `UPDATE pedidos
           SET status = 'confirmado', updated_at = NOW()
         WHERE id = $1 AND empresa_id = $2
           AND status NOT IN ('cancelado', 'entregue', 'confirmado',
                              'preparando', 'pronto')
         RETURNING id`,
        [pagamento.pedido_id, empresaId]
      ).catch(() => null);
      pedidoConfirmado = !!upd;

      // Caixa (idempotente)
      try {
        const r = await registrarVendaPedido(
          empresaId, pagamento.pedido_id, Number(pagamento.valor), "pix"
        );
        vendaRegistrada = r.registrado;
      } catch { /* não-fatal */ }

      // Push (sempre dispara em force; caso contrário só se mudou status)
      try {
        const nomeGw = NOMES_GATEWAY[pagamento.gateway_slug] ?? pagamento.gateway_slug;
        await enviarPushParaUsuariosDaEmpresa(empresaId, {
          title: `💰 Pagamento confirmado`,
          body:  `R$ ${Number(pagamento.valor).toFixed(2).replace(".", ",")} via ${nomeGw}`,
          url:   `/painel/pedidos`,
          tag:   "pagamento-confirmado",
        });
        pushEnviado = true;
      } catch { /* não-fatal */ }
    }

    // Audit log
    await auditLog({
      acao:           force ? "pagamento:reprocessar" : "pagamento:sincronizar",
      recurso:        "pagamentos",
      recursoId:      pagamento.id,
      dadosAnteriores: { status: pagamento.status },
      dadosNovos:      {
        status: statusRemoto,
        force,
        pedidoConfirmado,
        vendaRegistrada,
        pushEnviado,
      },
      usuario:        { sub: auth.payload.sub, empresaId },
    });

    return ok({
      pagamento_id:     pagamento.id,
      status_anterior:  pagamento.status,
      status_atual:     statusRemoto,
      mudou:            mudouStatus,
      force,
      efeitos: {
        pedido_confirmado: pedidoConfirmado,
        venda_registrada:  vendaRegistrada,
        push_enviado:      pushEnviado,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao sincronizar";
    console.error("[Pagamentos/Sincronizar]", err);
    return serverError(msg);
  }
}
