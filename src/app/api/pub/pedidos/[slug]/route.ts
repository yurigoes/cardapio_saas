import { NextRequest } from "next/server";
import { z } from "zod";
import { queryOne, transaction } from "@/lib/db/client";
import { ok, notFound, badRequest, serverError } from "@/lib/utils/response";
import { precoSchema, uuidSchema } from "@/lib/utils/validators";
import type { PoolClient } from "pg";

const itemSchema = z.object({
  produto_id:     uuidSchema,
  nome:           z.string().min(1).max(255).trim(),
  preco_unitario: precoSchema,
  quantidade:     z.number().int().min(1).max(100),
  observacoes:    z.string().max(500).trim().optional(),
});

const pedidoPublicoSchema = z.object({
  cliente_nome:     z.string().min(2).max(255).trim().optional(),
  cliente_telefone: z.string().regex(/^\d{10,15}$/).optional(),
  cliente_id:       uuidSchema.optional(),
  observacoes:      z.string().max(1000).trim().optional(),
  mesa_id:          uuidSchema.optional(),
  itens:            z.array(itemSchema).min(1, "Pedido deve ter ao menos 1 item"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  let body: z.output<typeof pedidoPublicoSchema>;
  try {
    body = pedidoPublicoSchema.parse(await req.json());
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  try {
    const empresa = await queryOne<{
      id: string;
      pontos_por_real: number;
      fidelidade_ativo: boolean;
    }>(
      `SELECT id, pontos_por_real, fidelidade_ativo
       FROM empresas WHERE slug = $1 AND deleted_at IS NULL AND status = 'ativo'`,
      [params.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const pedido = await transaction(async (client: PoolClient) => {
      const subtotal = body.itens.reduce(
        (acc, item) => acc + item.preco_unitario * item.quantidade,
        0
      );

      const tipo = body.mesa_id ? "mesa" : "totem";

      // Calcular pontos a ganhar
      let pontosGanhos = 0;
      if (body.cliente_id && empresa.fidelidade_ativo && empresa.pontos_por_real > 0) {
        pontosGanhos = Math.floor(subtotal * Number(empresa.pontos_por_real));
      }

      const [row] = await client.query<{ id: string; numero: number }>(
        `INSERT INTO pedidos
           (empresa_id, tipo, status, mesa_id, cliente_id, cliente_nome, cliente_telefone,
            subtotal, desconto, taxa_entrega, total, pontos_ganhos, observacoes)
         VALUES ($1, $2, 'pendente', $3, $4, $5, $6, $7, 0, 0, $7, $8, $9)
         RETURNING id, numero`,
        [
          empresa.id,
          tipo,
          body.mesa_id          || null,
          body.cliente_id       || null,
          body.cliente_nome     || null,
          body.cliente_telefone || null,
          subtotal,
          pontosGanhos,
          body.observacoes      || null,
        ]
      ).then((r) => r.rows);

      // Marca mesa como ocupada se veio com mesa_id
      if (body.mesa_id) {
        await client.query(
          `UPDATE mesas SET status = 'ocupada', pedido_ativo_id = $1 WHERE id = $2 AND empresa_id = $3`,
          [row.id, body.mesa_id, empresa.id]
        );
      }

      for (const item of body.itens) {
        const itemSubtotal = item.preco_unitario * item.quantidade;
        await client.query(
          `INSERT INTO pedido_itens
             (pedido_id, produto_id, nome, preco_unitario, quantidade,
              subtotal, observacoes, adicionais, complementos)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            row.id,
            item.produto_id,
            item.nome,
            item.preco_unitario,
            item.quantidade,
            itemSubtotal,
            item.observacoes || null,
            "[]",
            "[]",
          ]
        );
      }

      // Atualiza stats do cliente e credita pontos
      if (body.cliente_id) {
        await client.query(
          `UPDATE clientes SET
             total_pedidos   = total_pedidos + 1,
             total_gasto     = total_gasto + $1,
             ultimo_pedido_em = NOW(),
             pontos          = pontos + $2,
             updated_at      = NOW()
           WHERE id = $3`,
          [subtotal, pontosGanhos, body.cliente_id]
        );
      }

      return { ...row, pontosGanhos };
    });

    return ok({ id: pedido.id, numero: pedido.numero, pontos_ganhos: pedido.pontosGanhos });
  } catch (err) {
    console.error("[Pub/Pedidos/POST]", err);
    return serverError();
  }
}
