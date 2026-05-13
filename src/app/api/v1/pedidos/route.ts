/**
 * GET /api/v1/pedidos    → lista pedidos (read)
 * POST /api/v1/pedidos   → cria pedido (write)
 *
 * Auth: Authorization: Bearer apk_xxx
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { query, queryCount, transaction } from "@/lib/db/client";
import { verifyApiKey, hasScope } from "@/lib/auth/api-key";
import { ok, created, unauthorized, forbidden, badRequest, serverError, paginatedOk } from "@/lib/utils/response";
import type { PoolClient } from "pg";

export async function GET(req: NextRequest) {
  const ip  = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ctx = await verifyApiKey(req.headers.get("authorization"), ip);
  if (!ctx) return unauthorized("API key inválida");
  if (!hasScope(ctx, "read")) return forbidden("Scope 'read' necessário");

  const sp     = req.nextUrl.searchParams;
  const page   = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit  = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10)));
  const status = sp.get("status");
  const tipo   = sp.get("tipo");
  const offset = (page - 1) * limit;

  const conds: string[] = ["empresa_id = $1", "deleted_at IS NULL"];
  const vals: unknown[] = [ctx.empresaId];
  let i = 2;
  if (status) { conds.push(`status = $${i++}`); vals.push(status); }
  if (tipo)   { conds.push(`tipo = $${i++}`);   vals.push(tipo); }

  const where = conds.join(" AND ");

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT id, numero, tipo, status, total, cliente_nome, cliente_telefone,
                created_at, updated_at
           FROM pedidos WHERE ${where}
           ORDER BY created_at DESC
           LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limit, offset]
      ),
      queryCount(`SELECT COUNT(*) FROM pedidos WHERE ${where}`, vals),
    ]);
    return paginatedOk(rows, total, page, limit);
  } catch (err) {
    console.error("[V1/Pedidos/GET]", err);
    return serverError();
  }
}

const itemSchema = z.object({
  produto_id:     z.string().uuid().optional(),
  nome:           z.string().min(1).max(255),
  preco_unitario: z.number().min(0),
  quantidade:     z.number().int().min(1).max(999),
  observacoes:    z.string().max(500).optional(),
});

const createSchema = z.object({
  tipo:             z.enum(["balcao","delivery","whatsapp","app"]).default("balcao"),
  cliente_nome:     z.string().max(255).optional(),
  cliente_telefone: z.string().max(20).optional(),
  observacoes:      z.string().max(1000).optional(),
  itens:            z.array(itemSchema).min(1),
});

export async function POST(req: NextRequest) {
  const ip  = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ctx = await verifyApiKey(req.headers.get("authorization"), ip);
  if (!ctx) return unauthorized("API key inválida");
  if (!hasScope(ctx, "write")) return forbidden("Scope 'write' necessário");

  let body: z.infer<typeof createSchema>;
  try { body = createSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const result = await transaction(async (client: PoolClient) => {
      const subtotal = body.itens.reduce((a, i) => a + i.preco_unitario * i.quantidade, 0);

      const r = await client.query<{ id: string; numero: number }>(
        `INSERT INTO pedidos
           (empresa_id, tipo, status, cliente_nome, cliente_telefone,
            subtotal, desconto, taxa_entrega, total, observacoes, origem, origem_id)
         VALUES ($1, $2, 'pendente', $3, $4, $5, 0, 0, $5, $6, 'api_v1', $7)
         RETURNING id, numero`,
        [
          ctx.empresaId, body.tipo,
          body.cliente_nome ?? null, body.cliente_telefone ?? null,
          subtotal, body.observacoes ?? null, ctx.id,
        ]
      ).then(x => x.rows[0]);

      for (const item of body.itens) {
        await client.query(
          `INSERT INTO pedido_itens
             (pedido_id, produto_id, nome, preco_unitario, quantidade, subtotal, observacoes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [r.id, item.produto_id ?? null, item.nome, item.preco_unitario,
           item.quantidade, item.preco_unitario * item.quantidade, item.observacoes ?? null]
        );
      }
      return r;
    });

    return created({ id: result.id, numero: result.numero, total: body.itens.reduce((a, i) => a + i.preco_unitario * i.quantidade, 0) });
  } catch (err) {
    console.error("[V1/Pedidos/POST]", err);
    return serverError();
  }
}
