/**
 * GET /api/pub/cliente?slug=&tipo=telefone|cpf&valor=
 * Usado pelo totem para identificar cliente (sem auth)
 * Retorna dados básicos do cliente + último pedido
 */
import { NextRequest } from "next/server";
import { queryOne, query } from "@/lib/db/client";
import { ok, badRequest, notFound, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug  = searchParams.get("slug");
  const tipo  = searchParams.get("tipo"); // "telefone" | "cpf"
  const valor = searchParams.get("valor");

  if (!slug || !tipo || !valor) return badRequest("slug, tipo e valor são obrigatórios");
  if (!["telefone","cpf"].includes(tipo)) return badRequest("tipo deve ser 'telefone' ou 'cpf'");

  try {
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND status = 'ativo'`, [slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const cliente = await queryOne<Record<string, unknown>>(
      `SELECT id, nome, telefone, cpf, pontos, total_pedidos, total_gasto,
              COALESCE(saldo_cashback, 0) AS saldo_cashback
       FROM clientes WHERE empresa_id = $1 AND ${tipo} = $2`,
      [empresa.id, valor]
    );
    if (!cliente) return ok({ encontrado: false });

    // Busca último pedido
    const ultimoPedido = await queryOne<Record<string, unknown>>(
      `SELECT id, numero, total, created_at,
              (SELECT json_agg(json_build_object(
                'nome', p.nome,
                'quantidade', pi.quantidade,
                'preco', pi.preco_unitario
              ))
               FROM pedido_itens pi
               JOIN produtos p ON p.id = pi.produto_id
               WHERE pi.pedido_id = pd.id
               LIMIT 5
              ) as itens
       FROM pedidos pd
       WHERE cliente_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [cliente.id as string]
    );

    return ok({ encontrado: true, cliente, ultimoPedido });
  } catch (err) {
    console.error("[pub/cliente/GET]", err);
    return serverError();
  }
}
