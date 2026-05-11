import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne, queryCount, transaction } from "@/lib/db/client";
import { assertModuloAtivo } from "@/lib/modules/checker";
import { temPermissao } from "@/lib/auth/rbac";
import { pedidoCreateSchema, paginacaoSchema, parseBodyOrThrow } from "@/lib/utils/validators";
import { ok, created, badRequest, forbidden, serverError, paginatedOk } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";
import { checkRateLimitByRequest, API_RATE_LIMIT } from "@/lib/security/rate-limit";
import { isDuplicateKeyError } from "@/lib/utils/errors";
import type { PoolClient } from "pg";

// ─────────────────────────────────────────────
// GET /api/pedidos — Lista pedidos da empresa
// ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden("Acesso restrito a operadores da empresa");

  if (!temPermissao(role, "pedido:ver")) {
    return forbidden("Sem permissão para visualizar pedidos");
  }

  const searchParams = req.nextUrl.searchParams;
  const params = paginacaoSchema.parse({
    page:  searchParams.get("page"),
    limit: searchParams.get("limit"),
  });

  const status = searchParams.get("status");
  const tipo   = searchParams.get("tipo");
  const offset = (params.page - 1) * params.limit;

  const conditions: string[] = ["p.empresa_id = $1", "p.deleted_at IS NULL"];
  const values: unknown[]    = [empresaId];
  let   paramIndex           = 2;

  // Garçom/cozinha só vê pedidos do dia
  if (role === "garcom" || role === "cozinha") {
    conditions.push(`p.created_at >= NOW() - INTERVAL '24 hours'`);
  }

  // Motoboy só vê seus próprios pedidos
  if (role === "motoboy") {
    conditions.push(`p.motoboy_id = $${paramIndex}`);
    values.push(auth.payload.sub);
    paramIndex++;
  }

  if (status) {
    conditions.push(`p.status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  if (tipo) {
    conditions.push(`p.tipo = $${paramIndex}`);
    values.push(tipo);
    paramIndex++;
  }

  const where = conditions.join(" AND ");

  const [pedidos, total] = await Promise.all([
    query(
      `SELECT p.id, p.numero, p.tipo, p.status, p.total, p.created_at,
              p.cliente_nome, p.mesa_id, p.comanda,
              m.numero as mesa_numero,
              u.nome as atendente_nome
       FROM pedidos p
       LEFT JOIN mesas m ON m.id = p.mesa_id
       LEFT JOIN usuarios u ON u.id = p.atendente_id
       WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, params.limit, offset]
    ),
    queryCount(`SELECT COUNT(*) FROM pedidos p WHERE ${where}`, values),
  ]);

  return paginatedOk(pedidos, total, params.page, params.limit);
}

// ─────────────────────────────────────────────
// POST /api/pedidos — Cria novo pedido
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden("Acesso restrito a operadores da empresa");

  if (!temPermissao(role, "pedido:criar")) {
    return forbidden("Sem permissão para criar pedidos");
  }

  // Rate limit por empresa
  const rateLimit = await checkRateLimitByRequest(req, {
    ...API_RATE_LIMIT,
    keyPrefix: `rl:pedido:${empresaId}`,
  });
  if (!rateLimit.success) return forbidden("Muitos pedidos em pouco tempo");

  let body: z.output<typeof pedidoCreateSchema>;
  try {
    body = await parseBodyOrThrow(req, pedidoCreateSchema);
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  // Verifica módulo necessário
  try {
    const moduloMap: Record<string, string> = {
      mesa:     "mesa",
      delivery: "delivery",
      balcao:   "balcao",
      totem:    "totem",
    };
    const modulo = moduloMap[body.tipo];
    if (modulo) {
      await assertModuloAtivo(empresaId, modulo as never);
    }
  } catch {
    return forbidden("Módulo necessário não está ativo");
  }

  try {
    const pedido = await transaction(async (client: PoolClient) => {
      // Calcula subtotal e total
      const subtotal = body.itens.reduce(
        (acc, item) => acc + item.preco_unitario * item.quantidade,
        0
      );
      const total = subtotal + (body.taxa_entrega ?? 0) - (body.desconto ?? 0);

      // Cria pedido
      const [novoPedido] = await client.query<{ id: string; numero: number }>(
        `INSERT INTO pedidos
           (empresa_id, tipo, status, mesa_id, comanda, cliente_id, cliente_nome,
            cliente_telefone, cliente_endereco, subtotal, desconto, taxa_entrega,
            total, observacoes, usuario_id, atendente_id)
         VALUES ($1,$2,'pendente',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
         RETURNING id, numero`,
        [
          empresaId,
          body.tipo,
          body.mesa_id        || null,
          body.comanda        || null,
          body.cliente_id     || null,
          body.cliente_nome   || null,
          body.cliente_telefone || null,
          body.cliente_endereco ? JSON.stringify(body.cliente_endereco) : null,
          subtotal,
          body.desconto       ?? 0,
          body.taxa_entrega   ?? 0,
          total,
          body.observacoes    || null,
          auth.payload.sub,
        ]
      ).then(r => r.rows);

      // Insere itens
      for (const item of body.itens) {
        const itemSubtotal = item.preco_unitario * item.quantidade;
        await client.query(
          `INSERT INTO pedido_itens
             (pedido_id, produto_id, nome, preco_unitario, quantidade,
              subtotal, observacoes, adicionais, complementos)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            novoPedido.id,
            item.produto_id || null,
            item.nome,
            item.preco_unitario,
            item.quantidade,
            itemSubtotal,
            item.observacoes || null,
            JSON.stringify(item.adicionais ?? []),
            JSON.stringify(item.complementos ?? []),
          ]
        );

        // Desconta estoque se necessário
        if (item.produto_id) {
          await client.query(
            `UPDATE produtos
             SET estoque_atual = estoque_atual - $1
             WHERE id = $2 AND controlar_estoque = TRUE AND estoque_atual >= $1`,
            [item.quantidade, item.produto_id]
          );
        }
      }

      // Se mesa, atualiza status
      if (body.mesa_id) {
        await client.query(
          `UPDATE mesas SET status = 'ocupada', pedido_ativo_id = $1 WHERE id = $2`,
          [novoPedido.id, body.mesa_id]
        );
      }

      return novoPedido;
    });

    await auditLog({
      acao:      "pedido:criar",
      recurso:   "pedidos",
      recursoId: pedido.id,
      usuario:   { sub: auth.payload.sub, empresaId },
    });

    return created({ id: pedido.id, numero: pedido.numero });
  } catch (err) {
    console.error("[Pedidos/POST]", err);
    if (isDuplicateKeyError(err)) {
      return badRequest("Pedido duplicado");
    }
    return serverError();
  }
}
