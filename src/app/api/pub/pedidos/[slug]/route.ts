/**
 * POST /api/pub/pedidos/[slug]
 * Criação pública de pedido (totem, QR mesa, balcão)
 *
 * Root-cause do 400: pg retorna NUMERIC como string → z.number() rejeitava preco_unitario.
 * Fix: z.preprocess em todos os campos numéricos.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { queryOne, transaction } from "@/lib/db/client";
import { ok, notFound, badRequest, serverError } from "@/lib/utils/response";
import type { PoolClient } from "pg";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Aceita number OU string numérica (pg NUMERIC → string) */
const precoLenient = z.preprocess(
  (v) => (typeof v === "string" ? parseFloat(v) : v),
  z.number().min(0).max(99_999.99)
);

/** Aceita number OU string inteira */
const intLenient = z.preprocess(
  (v) => (typeof v === "string" ? parseInt(v, 10) : v),
  z.number().int().min(1).max(100)
);

/** UUID ou undefined; rejeita string vazia */
const uuidOpt = z
  .string()
  .uuid("ID inválido")
  .optional()
  .transform((v) => v || undefined);

/** Telefone: aceita formatado (xx) xxxxx-xxxx, strip não-dígitos */
const telefoneLenient = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{10,15}$/, "Telefone inválido"))
  .optional();

// ── schemas ───────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  produto_id:     z.string().uuid("produto_id inválido").optional(),
  nome:           z.string().min(1).max(255).trim(),
  preco_unitario: precoLenient,
  quantidade:     intLenient,
  observacoes:    z.string().max(500).trim().optional().transform((v) => v || undefined),
});

const pedidoPublicoSchema = z.object({
  /* Tipo de consumo para controle interno */
  tipo_consumo:     z.enum(["local", "retirada", "delivery"]).optional().default("local"),
  forma_pagamento:  z.string().max(50).optional(),

  /* Dados do cliente */
  cliente_nome:     z.string().min(1).max(255).trim().optional().transform((v) => v || undefined),
  cliente_telefone: telefoneLenient,
  cliente_id:       uuidOpt,

  /* Pedido */
  observacoes:      z.string().max(1000).trim().optional().transform((v) => v || undefined),
  mesa_id:          uuidOpt,
  itens:            z.array(itemSchema).min(1, "Pedido deve ter ao menos 1 item"),
});

// ── handler ───────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // Parse body
  let body: z.output<typeof pedidoPublicoSchema>;
  try {
    const raw = await req.json();
    const result = pedidoPublicoSchema.safeParse(raw);
    if (!result.success) {
      const msg = result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      return badRequest(msg);
    }
    body = result.data;
  } catch {
    return badRequest("JSON inválido");
  }

  try {
    // Busca empresa
    const empresa = await queryOne<{
      id:               string;
      pontos_por_real:  number;
      fidelidade_ativo: boolean;
    }>(
      `SELECT id,
              COALESCE(pontos_por_real, 0)   AS pontos_por_real,
              COALESCE(fidelidade_ativo, false) AS fidelidade_ativo
       FROM empresas
       WHERE slug = $1 AND deleted_at IS NULL AND status = 'ativo'`,
      [params.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const pedido = await transaction(async (client: PoolClient) => {
      // Subtotal — preco_unitario já é number após preprocess
      const subtotal = body.itens.reduce(
        (acc, item) => acc + item.preco_unitario * item.quantidade,
        0
      );

      // Mapeia tipo do pedido
      const tipo = body.mesa_id
        ? "mesa"
        : body.tipo_consumo === "delivery"
          ? "delivery"
          : body.tipo_consumo === "retirada"
            ? "balcao"
            : "totem";

      // Pontos
      let pontosGanhos = 0;
      if (
        body.cliente_id &&
        empresa.fidelidade_ativo &&
        Number(empresa.pontos_por_real) > 0
      ) {
        pontosGanhos = Math.floor(subtotal * Number(empresa.pontos_por_real));
      }

      // Insere pedido
      const rows = await client
        .query<{ id: string; numero: number }>(
          `INSERT INTO pedidos
             (empresa_id, tipo, status, mesa_id, cliente_id, cliente_nome, cliente_telefone,
              subtotal, desconto, taxa_entrega, total, pontos_ganhos, observacoes,
              forma_pagamento, tipo_consumo)
           VALUES ($1,$2,'pendente',$3,$4,$5,$6,$7,0,0,$7,$8,$9,$10,$11)
           RETURNING id, numero`,
          [
            empresa.id,
            tipo,
            body.mesa_id          ?? null,
            body.cliente_id       ?? null,
            body.cliente_nome     ?? null,
            body.cliente_telefone ?? null,
            subtotal,
            pontosGanhos,
            body.observacoes      ?? null,
            body.forma_pagamento  ?? null,
            body.tipo_consumo     ?? "local",
          ]
        )
        .then((r) => r.rows);

      const row = rows[0];

      // Ocupa mesa
      if (body.mesa_id) {
        await client.query(
          `UPDATE mesas
             SET status = 'ocupada', pedido_ativo_id = $1
           WHERE id = $2 AND empresa_id = $3`,
          [row.id, body.mesa_id, empresa.id]
        );
      }

      // Itens
      for (const item of body.itens) {
        const itemSubtotal = item.preco_unitario * item.quantidade;
        await client.query(
          `INSERT INTO pedido_itens
             (pedido_id, produto_id, nome, preco_unitario, quantidade,
              subtotal, observacoes, adicionais, complementos)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'[]','[]')`,
          [
            row.id,
            item.produto_id ?? null,
            item.nome,
            item.preco_unitario,
            item.quantidade,
            itemSubtotal,
            item.observacoes ?? null,
          ]
        );
      }

      // Atualiza cliente
      if (body.cliente_id) {
        await client.query(
          `UPDATE clientes SET
             total_pedidos    = total_pedidos + 1,
             total_gasto      = total_gasto + $1,
             ultimo_pedido_em = NOW(),
             pontos           = pontos + $2,
             updated_at       = NOW()
           WHERE id = $3`,
          [subtotal, pontosGanhos, body.cliente_id]
        );
      }

      return { ...row, pontosGanhos };
    });

    return ok({
      id:           pedido.id,
      numero:       pedido.numero,
      pontos_ganhos: pedido.pontosGanhos,
    });
  } catch (err) {
    console.error("[Pub/Pedidos/POST]", err);
    return serverError();
  }
}
