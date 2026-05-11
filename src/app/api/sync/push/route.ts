/**
 * POST /api/sync/push — Slave envia pedidos criados offline para a VPS
 *
 * Requer:
 *   - Authorization: Bearer <slave_jwt>
 *   - X-Slave-Sig: HMAC-SHA256(body_string, slave_key)
 *
 * Body:
 * {
 *   pedidos: [{
 *     slave_uuid, tipo, status, mesa_id?, cliente_nome?, cliente_telefone?,
 *     subtotal, total, observacoes?,
 *     itens: [{ produto_id, nome, preco_unitario, quantidade, subtotal, observacoes? }],
 *     created_at
 *   }],
 *   mesa_eventos: [{ mesa_id, status, pedido_ativo_id?, slave_uuid? }]
 * }
 *
 * Retorna: { aceitos, duplicados, erros }
 */

import { NextRequest } from "next/server";
import { query, queryOne, transaction } from "@/lib/db/client";
import { verifySlaveJWT, extractBearer, verifyPayload } from "@/lib/sync/auth";
import { ok, unauthorized, badRequest, serverError } from "@/lib/utils/response";
import { PoolClient } from "pg";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface ItemPedido {
  produto_id:     string;
  nome:           string;
  preco_unitario: number;
  quantidade:     number;
  subtotal:       number;
  observacoes?:   string;
}

interface PedidoPayload {
  slave_uuid:        string;
  tipo:              string;
  status:            string;
  mesa_id?:          string;
  cliente_nome?:     string;
  cliente_telefone?: string;
  subtotal:          number;
  total:             number;
  observacoes?:      string;
  itens:             ItemPedido[];
  created_at:        string;
}

interface MesaEvento {
  mesa_id:          string;
  status:           string;
  pedido_ativo_id?: string | null;
  slave_uuid?:      string;
}

interface PushBody {
  pedidos?:      PedidoPayload[];
  mesa_eventos?: MesaEvento[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Lê body como texto para verificar HMAC antes de parsear
  const bodyText = await req.text();

  // Verifica slave JWT
  const token = extractBearer(req.headers.get("authorization"));
  if (!token) return unauthorized("Token não fornecido");

  let slavePayload: Awaited<ReturnType<typeof verifySlaveJWT>>;
  try {
    slavePayload = await verifySlaveJWT(token);
  } catch {
    return unauthorized("Token inválido ou expirado");
  }

  // Busca empresa e slave_key
  const empresa = await queryOne<{ id: string; slave_key: string }>(
    `SELECT id, slave_key
     FROM empresas
     WHERE id = $1 AND deleted_at IS NULL AND status = 'ativo'`,
    [slavePayload.empresaId]
  );

  if (!empresa) return unauthorized("Empresa não encontrada ou inativa");
  if (!empresa.slave_key) return unauthorized("Slave não configurado para esta empresa");

  // Verifica assinatura HMAC do body
  const sig = req.headers.get("x-slave-sig") ?? "";
  if (!verifyPayload(bodyText, sig, empresa.slave_key)) {
    return unauthorized("Assinatura HMAC inválida");
  }

  // Parse body
  let body: PushBody;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return badRequest("Body JSON inválido");
  }

  const pedidos     = body.pedidos     ?? [];
  const mesaEventos = body.mesa_eventos ?? [];

  const resultado = {
    aceitos:    0,
    duplicados: 0,
    erros:      [] as string[],
  };

  try {
    await transaction(async (client: PoolClient) => {
      // ── Processar pedidos ──────────────────────────────────────────────────
      for (const pedido of pedidos) {
        if (!pedido.slave_uuid) {
          resultado.erros.push("Pedido sem slave_uuid ignorado");
          continue;
        }

        try {
          // Verifica se já existe (deduplicação por slave_uuid)
          const existente = await client.query(
            `SELECT id FROM pedidos WHERE slave_uuid = $1`,
            [pedido.slave_uuid]
          );

          if (existente.rows.length > 0) {
            resultado.duplicados++;
            continue;
          }

          // Insere o pedido
          const novoPedido = await client.query(
            `INSERT INTO pedidos
               (empresa_id, tipo, status, mesa_id, cliente_nome, cliente_telefone,
                subtotal, total, observacoes, origem, slave_uuid, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'slave',$10,$11,NOW())
             RETURNING id`,
            [
              empresa.id,
              pedido.tipo       || "balcao",
              pedido.status     || "pendente",
              pedido.mesa_id    || null,
              pedido.cliente_nome     || null,
              pedido.cliente_telefone || null,
              pedido.subtotal,
              pedido.total,
              pedido.observacoes || null,
              pedido.slave_uuid,
              pedido.created_at ? new Date(pedido.created_at) : new Date(),
            ]
          );

          const pedidoId = novoPedido.rows[0].id;

          // Insere itens do pedido
          for (const item of pedido.itens ?? []) {
            await client.query(
              `INSERT INTO pedido_itens
                 (pedido_id, produto_id, nome, preco_unitario, quantidade, subtotal, observacoes)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [
                pedidoId,
                item.produto_id   || null,
                item.nome,
                item.preco_unitario,
                item.quantidade,
                item.subtotal,
                item.observacoes  || null,
              ]
            );
          }

          resultado.aceitos++;
        } catch (err) {
          resultado.erros.push(`Pedido ${pedido.slave_uuid}: ${String(err)}`);
        }
      }

      // ── Processar eventos de mesa ──────────────────────────────────────────
      for (const evento of mesaEventos) {
        try {
          await client.query(
            `UPDATE mesas
             SET status          = $1,
                 pedido_ativo_id = $2,
                 updated_at      = NOW()
             WHERE id = $3 AND empresa_id = $4`,
            [
              evento.status,
              evento.pedido_ativo_id ?? null,
              evento.mesa_id,
              empresa.id,
            ]
          );
        } catch (err) {
          resultado.erros.push(`Mesa ${evento.mesa_id}: ${String(err)}`);
        }
      }
    });

    // Atualiza slave_ultimo_sync e registra sync_log
    await Promise.all([
      query(
        `UPDATE empresas SET slave_ultimo_sync = NOW(), updated_at = NOW() WHERE id = $1`,
        [empresa.id]
      ),
      query(
        `INSERT INTO sync_log (empresa_id, tipo, registros, sucesso, erro)
         VALUES ($1, 'push', $2, $3, $4)`,
        [
          empresa.id,
          resultado.aceitos,
          resultado.erros.length === 0,
          resultado.erros.length > 0 ? resultado.erros.join("; ") : null,
        ]
      ),
    ]);

    return ok(resultado);
  } catch (err) {
    console.error("[Sync/Push/POST]", err);

    try {
      await query(
        `INSERT INTO sync_log (empresa_id, tipo, registros, sucesso, erro)
         VALUES ($1, 'push', 0, false, $2)`,
        [empresa.id, String(err)]
      );
    } catch { /* ignore */ }

    return serverError();
  }
}
