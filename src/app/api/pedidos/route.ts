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
import { registrarSaidaEstoque } from "@/lib/estoque/movimento";
import { notificarEvolution } from "@/lib/notify/evolution";
import { dispatchCupomCozinha } from "@/lib/print/dispatch";
import { emManutencao } from "@/lib/security/manutencao";
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

  // Modo manutenção — bloqueia criação de pedidos novos
  const manutencao = await emManutencao();
  if (manutencao.ativo) {
    return forbidden(manutencao.mensagem || "Sistema em manutenção. Voltamos em breve.");
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
    return forbidden(
      `Módulo "${body.tipo}" não está ativo para esta empresa. ` +
      `Acesse /admin/empresas para liberar o módulo, ou aguarde a ativação do trial.`
    );
  }

  try {
    const result = await transaction(async (client: PoolClient) => {
      const subtotalNovo = body.itens.reduce(
        (acc, item) => acc + item.preco_unitario * item.quantidade, 0
      );

      // ── Acúmulo em pedido aberto da mesa ─────────────────────────────────
      // Para tipo=mesa, se a mesa tem pedido_ativo_id em estado aberto,
      // adiciona itens ao pedido existente em vez de criar um novo.
      // Estados "abertos" para acúmulo: pendente, confirmado, preparando, pronto.
      // (entregue/cancelado abrem rodada nova.)
      const ESTADOS_ABERTOS = ["pendente", "confirmado", "preparando", "pronto"];

      if (body.tipo === "mesa" && body.mesa_id) {
        const ativo = await client.query<{
          pedido_ativo_id: string | null;
        }>(
          `SELECT pedido_ativo_id FROM mesas
           WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
           FOR UPDATE`,
          [body.mesa_id, empresaId]
        ).then(r => r.rows[0]);

        if (ativo?.pedido_ativo_id) {
          const pedidoAtivo = await client.query<{
            id: string; numero: number; status: string;
            subtotal: string; desconto: string; taxa_entrega: string;
          }>(
            `SELECT id, numero, status, subtotal, desconto, taxa_entrega
             FROM pedidos
             WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
             FOR UPDATE`,
            [ativo.pedido_ativo_id, empresaId]
          ).then(r => r.rows[0]);

          if (pedidoAtivo && ESTADOS_ABERTOS.includes(pedidoAtivo.status)) {
            // ACUMULA: adiciona itens ao pedido existente
            for (const item of body.itens) {
              const itemSubtotal = item.preco_unitario * item.quantidade;
              await client.query(
                `INSERT INTO pedido_itens
                   (pedido_id, produto_id, nome, preco_unitario, quantidade,
                    subtotal, observacoes, adicionais, complementos)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [
                  pedidoAtivo.id,
                  item.produto_id || null,
                  item.nome, item.preco_unitario, item.quantidade, itemSubtotal,
                  item.observacoes || null,
                  JSON.stringify(item.adicionais ?? []),
                  JSON.stringify(item.complementos ?? []),
                ]
              );
              if (item.produto_id) {
                await registrarSaidaEstoque(
                  client, empresaId, item.produto_id, pedidoAtivo.id,
                  item.quantidade, auth.payload.sub
                );
              }
            }

            // Recalcula totais (usa SUM dos itens — fonte da verdade)
            const totals = await client.query<{ subtotal: string }>(
              `SELECT COALESCE(SUM(subtotal), 0) AS subtotal
               FROM pedido_itens WHERE pedido_id = $1`,
              [pedidoAtivo.id]
            ).then(r => r.rows[0]);

            const novoSub  = Number(totals.subtotal);
            const desconto = Number(pedidoAtivo.desconto);
            const taxa     = Number(pedidoAtivo.taxa_entrega);
            const novoTot  = novoSub + taxa - desconto;

            await client.query(
              `UPDATE pedidos
                 SET subtotal = $1, total = $2,
                     observacoes = COALESCE(NULLIF($3, ''), observacoes),
                     updated_at = NOW()
               WHERE id = $4`,
              [novoSub, novoTot, body.observacoes ?? "", pedidoAtivo.id]
            );

            return {
              id: pedidoAtivo.id,
              numero: pedidoAtivo.numero,
              acumulado: true,
              subtotal_anterior: Number(pedidoAtivo.subtotal),
              subtotal_novo:     novoSub,
              itens_adicionados: body.itens.length,
            };
          }
        }
      }

      // ── Pedido novo (totem, balcão, delivery, ou mesa sem ativo) ─────────
      const total = subtotalNovo + (body.taxa_entrega ?? 0) - (body.desconto ?? 0);
      const [novoPedido] = await client.query<{ id: string; numero: number }>(
        `INSERT INTO pedidos
           (empresa_id, tipo, status, mesa_id, comanda, cliente_id, cliente_nome,
            cliente_telefone, cliente_endereco, subtotal, desconto, taxa_entrega,
            total, observacoes, usuario_id, atendente_id)
         VALUES ($1,$2,'pendente',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
         RETURNING id, numero`,
        [
          empresaId, body.tipo,
          body.mesa_id        || null,
          body.comanda        || null,
          body.cliente_id     || null,
          body.cliente_nome   || null,
          body.cliente_telefone || null,
          body.cliente_endereco ? JSON.stringify(body.cliente_endereco) : null,
          subtotalNovo,
          body.desconto       ?? 0,
          body.taxa_entrega   ?? 0,
          total,
          body.observacoes    || null,
          auth.payload.sub,
        ]
      ).then(r => r.rows);

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
            item.nome, item.preco_unitario, item.quantidade, itemSubtotal,
            item.observacoes || null,
            JSON.stringify(item.adicionais ?? []),
            JSON.stringify(item.complementos ?? []),
          ]
        );
        if (item.produto_id) {
          await registrarSaidaEstoque(
            client, empresaId, item.produto_id, novoPedido.id,
            item.quantidade, auth.payload.sub
          );
        }
      }

      if (body.mesa_id) {
        await client.query(
          `UPDATE mesas SET status = 'ocupada', pedido_ativo_id = $1 WHERE id = $2`,
          [novoPedido.id, body.mesa_id]
        );
      }

      return { ...novoPedido, acumulado: false };
    });

    await auditLog({
      acao:      result.acumulado ? "pedido:acumular" : "pedido:criar",
      recurso:   "pedidos",
      recursoId: result.id,
      usuario:   { sub: auth.payload.sub, empresaId },
    });

    // WhatsApp para o dono (best-effort, não bloqueia resposta)
    if (!result.acumulado) {
      notificarEvolution(empresaId, "novo_pedido", {
        pedidoNumero: result.numero,
        total:        body.itens.reduce((a, i) => a + i.preco_unitario * i.quantidade, 0),
      }).catch(e => console.warn("[Pedidos/POST] notify:", e));
    }

    // Cozinha NÃO dispatcha aqui — só quando o pedido for CONFIRMADO
    // (PATCH /api/pedidos/[id] status=confirmado).
    // Razão: PDV/balcão pode criar pedido temporário; só imprime quando
    // operador confirma/finaliza. Pra totem/delivery (auto-confirmados),
    // dispatch acontece no PATCH ou no /api/pub/pedidos diretamente.

    return created(result);
  } catch (err) {
    console.error("[Pedidos/POST]", err);
    if (isDuplicateKeyError(err)) {
      return badRequest("Pedido duplicado");
    }
    return serverError();
  }
}
