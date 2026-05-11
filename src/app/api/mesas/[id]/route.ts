import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "mesa:ver")) return forbidden();

  try {
    const mesa = await queryOne(
      `SELECT
         m.id, m.numero, m.nome, m.capacidade, m.setor, m.status, m.qrcode_url,
         p.id          as pedido_id,
         p.numero      as pedido_numero,
         p.total       as pedido_total,
         p.subtotal    as pedido_subtotal,
         p.status      as pedido_status,
         p.created_at  as pedido_criado_em,
         EXTRACT(EPOCH FROM (NOW() - p.created_at))::int as tempo_aberta_segundos
       FROM mesas m
       LEFT JOIN pedidos p ON p.id = m.pedido_ativo_id AND p.deleted_at IS NULL
       WHERE m.id = $1 AND m.empresa_id = $2 AND m.deleted_at IS NULL`,
      [params.id, empresaId]
    );

    if (!mesa) return notFound("Mesa não encontrada");
    return ok(mesa);
  } catch (err) {
    console.error("[Mesas/GET-ONE]", err);
    return serverError();
  }
}
