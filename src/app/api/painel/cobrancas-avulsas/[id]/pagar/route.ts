/**
 * POST /api/painel/cobrancas-avulsas/[id]/pagar
 * Gera link Checkout MP pra cobrança avulsa.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { criarPreferencia, isSandbox } from "@/lib/billing/mercadopago";
import { getSaasBranding } from "@/lib/branding/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!["master", "admin", "gerente", "financeiro"].includes(role)) return forbidden();

  const c = await queryOne<{
    empresa_id: string; nome: string; motivo: string | null; valor: string;
    status: string; mp_init_point: string | null; mp_preference_id: string | null;
    empresa_nome: string; empresa_email: string | null;
  }>(
    `SELECT c.empresa_id, c.nome, c.motivo, c.valor, c.status,
            c.mp_init_point, c.mp_preference_id,
            e.nome_fantasia AS empresa_nome, e.email AS empresa_email
       FROM cobrancas_avulsas c
       JOIN empresas e ON e.id = c.empresa_id
      WHERE c.id = $1`,
    [params.id]
  );
  if (!c) return notFound();
  if (c.empresa_id !== empresaId) return forbidden();
  if (c.status === "paga" || c.status === "cancelada") return badRequest("Cobrança já encerrada");

  if (c.mp_init_point && c.mp_preference_id) {
    return ok({ init_point: c.mp_init_point, preference_id: c.mp_preference_id });
  }

  try {
    const branding = await getSaasBranding();
    const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tthreedigital.com.br";

    const pref = await criarPreferencia({
      items: [{
        id:          params.id,
        title:       `${branding.nome} — ${c.nome}`,
        description: c.motivo ?? c.nome,
        quantity:    1,
        unit_price:  Number(c.valor),
        currency_id: "BRL",
      }],
      // payer omitido — MP pergunta no checkout (evita "botão cinza" se email == dono da conta)
      external_reference: `COBR-${params.id}`,
      notification_url:   `${baseUrl}/api/webhooks/mercadopago-saas`,
      back_urls: {
        success: `${baseUrl}/painel/financeiro/mensalidades?cobranca=ok`,
        failure: `${baseUrl}/painel/financeiro/mensalidades?cobranca=fail`,
        pending: `${baseUrl}/painel/financeiro/mensalidades?cobranca=pendente`,
      },
      auto_return:         "approved",
      statement_descriptor: branding.nome?.slice(0, 22) ?? "SaaS",
      payment_methods: { installments: 12 },
    } as Parameters<typeof criarPreferencia>[0]);

    const sandbox = await isSandbox();
    const initPoint = sandbox ? pref.sandbox_init_point : pref.init_point;

    await query(
      `UPDATE cobrancas_avulsas
          SET mp_preference_id = $1, mp_init_point = $2, atualizado_em = NOW()
        WHERE id = $3`,
      [pref.id, initPoint, params.id]
    );

    return ok({ init_point: initPoint, preference_id: pref.id });
  } catch (err) {
    console.error("[CobrAv/Pagar]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
