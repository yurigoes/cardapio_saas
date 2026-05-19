/**
 * POST /api/painel/pedidos/[id]/confirmar-pagamento
 *
 * Operador no caixa confirma que recebeu o pagamento (geralmente
 * forma='cartao_caixa' onde cliente passou a maquininha manual).
 *
 * Comportamento:
 *  - Marca pedido status='confirmado' se ainda estiver 'pendente'
 *  - Dispara impressão da COZINHA + via final do CLIENTE (que não saiu
 *    no totem por ter sido cartao_caixa)
 *  - Body opcional: { forma_pagamento? }  pra atualizar a forma real
 *    (ex: totem mandou cartao_caixa, mas no caixa o cliente decidiu pagar
 *    em dinheiro — operador troca pra "dinheiro")
 *  - Idempotente: chamada repetida não imprime de novo (flag em DB)
 *
 * Aceita autenticação NORMAL (operador logado) OU lookup por número
 * (param ?numero=42) pra facilitar uso com leitor de código de barras.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, badRequest, forbidden, notFound, serverError } from "@/lib/utils/response";
import { dispatchCupomCozinha, dispatchCupomCliente } from "@/lib/print/dispatch";

const schema = z.object({
  forma_pagamento: z.string().max(50).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json().catch(() => ({}))); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    // Aceita lookup por id (UUID) OU por numero (querystring ?numero=42)
    const numero = req.nextUrl.searchParams.get("numero");
    let where: string; let val: string | number;
    if (numero && /^\d+$/.test(numero)) { where = "numero"; val = Number(numero); }
    else                                 { where = "id";     val = params.id; }

    const pedido = await queryOne<{
      id: string; numero: number; status: string;
      forma_pagamento: string | null;
      pagamento_confirmado_em: string | null;
    }>(
      `SELECT id, numero, status, forma_pagamento, pagamento_confirmado_em
         FROM pedidos
        WHERE ${where} = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [val, empresaId]
    );
    if (!pedido) return notFound(`Pedido ${where}=${val} não encontrado`);

    // Idempotência leve: se já foi confirmado antes, não dispara print de novo
    if (pedido.pagamento_confirmado_em) {
      return ok({
        id: pedido.id,
        numero: pedido.numero,
        ja_confirmado: true,
        confirmado_em: pedido.pagamento_confirmado_em,
        mensagem: "Pagamento já estava confirmado — não reimprimiu",
      });
    }

    // Atualiza status + flag + forma (se trocada)
    const novaForma = body.forma_pagamento ?? pedido.forma_pagamento ?? "cartao_caixa";
    const novoStatus = pedido.status === "pendente" ? "confirmado" : pedido.status;

    await queryOne(
      `UPDATE pedidos
          SET pagamento_confirmado_em = NOW(),
              status                  = $1,
              forma_pagamento         = $2,
              updated_at              = NOW()
        WHERE id = $3`,
      [novoStatus, novaForma, pedido.id]
    );

    // Dispara cozinha + cliente (essas que ficaram pendentes)
    dispatchCupomCozinha(empresaId, pedido.id)
      .catch(e => console.warn("[ConfirmarPagamento] print cozinha:", e));
    dispatchCupomCliente(empresaId, pedido.id)
      .catch(e => console.warn("[ConfirmarPagamento] print cliente:", e));

    console.info(`[ConfirmarPagamento] pedido #${pedido.numero} confirmado por user=${auth.payload.sub}`);

    return ok({
      id:             pedido.id,
      numero:         pedido.numero,
      status:         novoStatus,
      forma_pagamento: novaForma,
      ja_confirmado:  false,
      mensagem:       "Pagamento confirmado, cozinha e via final enviadas pra impressora",
    });
  } catch (err) {
    console.error("[ConfirmarPagamento]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
