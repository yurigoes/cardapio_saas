/**
 * POST /api/painel/modulos/[modulo]/comprar
 *
 * Cria intenção de compra E gera link Mercado Pago pra pagamento.
 * Quando o pagamento for confirmado (via webhook /api/webhooks/mercadopago),
 * o status vira 'pago' e o módulo fica ativo até `ativa_ate`.
 *
 * Se MERCADOPAGO_ACCESS_TOKEN não estiver configurado, devolve só
 * o registro pendente (modo manual — fatura via outro meio).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { MODULOS } from "@/lib/modules/catalog";
import { getSaasBranding } from "@/lib/branding/server";
import { criarPreferencia, isSandbox } from "@/lib/billing/mercadopago";

export async function POST(
  req: NextRequest,
  { params }: { params: { modulo: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master", "admin", "gerente"].includes(auth.payload.role)) {
    return forbidden();
  }
  const { empresaId, sub, email } = auth.payload;
  if (!empresaId) return forbidden("Empresa não identificada");

  const modulo = params.modulo;
  const def = MODULOS.find(m => m.key === modulo);
  if (!def) return badRequest(`Módulo desconhecido: ${modulo}`);

  try {
    const compra = await queryOne<{ id: string; valor: string }>(
      `INSERT INTO modulo_compras (empresa_id, modulo, valor, criado_por)
       VALUES ($1, $2, $3, $4)
       RETURNING id, valor`,
      [empresaId, modulo, def.preco, sub]
    );
    if (!compra) return serverError("Falha ao criar compra");

    // Tenta integração Mercado Pago
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tthreedigital.com.br";
    let checkoutUrl: string | null = null;
    let avisoMP: string | null = null;

    // Tenta MP — se DB tem token (saas_billing_config) OU env, vai funcionar
    {
      const branding = await getSaasBranding();
      try {
        const pref = await criarPreferencia({
          items: [{
            id:           modulo,
            title:        `Módulo ${def.nome} — ${branding.nome}`,
            description:  `Acesso mensal ao módulo ${def.nome}`,
            quantity:     1,
            unit_price:   Number(compra.valor),
            currency_id:  "BRL",
          }],
          payer: { email: email ?? "comprador@cardapio-saas.com" },
          external_reference: compra.id,
          notification_url:   `${baseUrl}/api/webhooks/mercadopago-modulos`,
          back_urls: {
            success: `${baseUrl}/painel?compra=sucesso`,
            failure: `${baseUrl}/painel?compra=falha`,
            pending: `${baseUrl}/painel?compra=pendente`,
          },
          auto_return: "approved",
        });

        // Salva referência da preferência
        await queryOne(
          `UPDATE modulo_compras SET gateway_ref = $1 WHERE id = $2`,
          [`mp:pref:${pref.id}`, compra.id]
        );

        checkoutUrl = (await isSandbox()) ? pref.sandbox_init_point : pref.init_point;
      } catch (e) {
        console.error("[modulos/comprar] MP falhou:", e);
        avisoMP = "Gateway de pagamento indisponível — verifique config em /admin/billing ou tente em alguns minutos.";
      }
    }

    return ok({
      compra_id:    compra.id,
      modulo,
      valor:        Number(compra.valor),
      status:       "pendente",
      checkout_url: checkoutUrl,
      aviso:        avisoMP,
      mensagem:     checkoutUrl
        ? "Compra registrada. Clique em 'Pagar agora' pra ir pro Mercado Pago."
        : avisoMP ?? "Compra registrada — aguardando pagamento.",
    });
  } catch (err) {
    console.error("[Painel/Modulos/Comprar]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
