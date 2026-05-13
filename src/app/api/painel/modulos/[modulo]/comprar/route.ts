/**
 * POST /api/painel/modulos/[modulo]/comprar
 *
 * Cria intenção de compra do módulo (status='pendente'). Quando o gateway
 * de pagamento confirmar (via webhook), o status vira 'pago' e o módulo
 * fica ativo até `ativa_ate` (1 mês a partir do pagamento).
 *
 * Por enquanto sem integração real de gateway — registra a intenção e
 * devolve link/instruções pra o cliente pagar manualmente.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { MODULOS } from "../../route";

export async function POST(
  req: NextRequest,
  { params }: { params: { modulo: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master", "admin", "gerente"].includes(auth.payload.role)) {
    return forbidden();
  }
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden("Empresa não identificada");

  const modulo = params.modulo;
  const def = MODULOS.find(m => m.key === modulo);
  if (!def) return badRequest(`Módulo desconhecido: ${modulo}`);

  try {
    const r = await queryOne<{ id: string; valor: string }>(
      `INSERT INTO modulo_compras (empresa_id, modulo, valor, criado_por)
       VALUES ($1, $2, $3, $4)
       RETURNING id, valor`,
      [empresaId, modulo, def.preco, sub]
    );

    return ok({
      compra_id: r?.id,
      modulo,
      valor:     Number(r?.valor),
      status:    "pendente",
      mensagem:  "Intenção de compra registrada. Em breve você receberá o link de pagamento.",
      // TODO: integrar com gateway (mp/stripe) e devolver link real aqui
    });
  } catch (err) {
    console.error("[Painel/Modulos/Comprar]", err);
    return serverError();
  }
}
