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
import { registrarSaidaEstoque } from "@/lib/estoque/movimento";
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

/** Cada opção de variação escolhida pelo cliente */
const adicionalSchema = z.object({
  grupo_id:    z.string().max(50),
  grupo_nome:  z.string().max(100),
  opcao_id:    z.string().max(50),
  opcao_nome:  z.string().max(100),
  preco_extra: precoLenient,
});

const itemSchema = z.object({
  produto_id:     z.string().uuid("produto_id inválido").optional(),
  nome:           z.string().min(1).max(255).trim(),
  preco_unitario: precoLenient,
  quantidade:     intLenient,
  observacoes:    z.string().max(500).trim().optional().transform((v) => v || undefined),
  adicionais:     z.array(adicionalSchema).optional(),
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
  cupom_codigo:     z.string().max(50).trim().optional().transform((v) => v || undefined),
  desconto:         precoLenient.optional(),
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
      id:                 string;
      pontos_por_real:    number;
      fidelidade_ativo:   boolean;
      caixa_obrigatorio:  boolean;
    }>(
      `SELECT id,
              COALESCE(pontos_por_real, 0)        AS pontos_por_real,
              COALESCE(fidelidade_ativo, false)   AS fidelidade_ativo,
              COALESCE(caixa_obrigatorio, false)  AS caixa_obrigatorio
       FROM empresas
       WHERE slug = $1 AND deleted_at IS NULL AND status = 'ativo'`,
      [params.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    // ── Bloqueio de caixa obrigatório ──────────────────────────────────────
    // Política: se caixa_obrigatorio=true, exige caixa aberto para pedidos
    // presenciais (mesa, balcão, totem). Delivery escapa pois não passa
    // por caixa físico (paga online ou direto ao entregador).
    const exigeCaixa = empresa.caixa_obrigatorio
      && body.tipo_consumo !== "delivery";
    if (exigeCaixa) {
      const caixaAberto = await queryOne<{ id: string }>(
        `SELECT id FROM caixas WHERE empresa_id = $1 AND status = 'aberto' LIMIT 1`,
        [empresa.id]
      ).catch(() => null);
      if (!caixaAberto) {
        return badRequest("Caixa fechado. Aguarde a abertura do caixa para fazer pedidos.");
      }
    }

    const pedido = await transaction(async (client: PoolClient) => {
      // Subtotal — preco_unitario já é number após preprocess
      const subtotal = body.itens.reduce(
        (acc, item) => acc + item.preco_unitario * item.quantidade,
        0
      );

      // ── Acúmulo em pedido aberto da mesa (totem QR mesa, segunda rodada) ──
      // Se há mesa_id E a mesa tem pedido_ativo aberto, adiciona itens nele.
      // Não aplica cupom novo nem soma pontos de novo (já foram no pedido inicial).
      const ESTADOS_ABERTOS = ["pendente", "confirmado", "preparando", "pronto"];
      if (body.mesa_id) {
        const ativo = await client.query<{ pedido_ativo_id: string | null }>(
          `SELECT pedido_ativo_id FROM mesas
           WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL FOR UPDATE`,
          [body.mesa_id, empresa.id]
        ).then(r => r.rows[0]);

        if (ativo?.pedido_ativo_id) {
          const pAtivo = await client.query<{
            id: string; numero: number; status: string;
            taxa_entrega: string; desconto: string;
          }>(
            `SELECT id, numero, status, taxa_entrega, desconto
             FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL FOR UPDATE`,
            [ativo.pedido_ativo_id, empresa.id]
          ).then(r => r.rows[0]);

          if (pAtivo && ESTADOS_ABERTOS.includes(pAtivo.status)) {
            for (const item of body.itens) {
              const itemSubtotal = item.preco_unitario * item.quantidade;
              await client.query(
                `INSERT INTO pedido_itens
                   (pedido_id, produto_id, nome, preco_unitario, quantidade,
                    subtotal, observacoes, adicionais, complementos)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[]')`,
                [
                  pAtivo.id, item.produto_id ?? null,
                  item.nome, item.preco_unitario, item.quantidade, itemSubtotal,
                  item.observacoes ?? null, JSON.stringify(item.adicionais ?? []),
                ]
              );
              if (item.produto_id) {
                await registrarSaidaEstoque(
                  client, empresa.id, item.produto_id, pAtivo.id, item.quantidade
                );
              }
            }
            // Recalcula subtotal a partir dos itens (fonte da verdade)
            const totals = await client.query<{ subtotal: string }>(
              `SELECT COALESCE(SUM(subtotal), 0) AS subtotal
               FROM pedido_itens WHERE pedido_id = $1`,
              [pAtivo.id]
            ).then(r => r.rows[0]);
            const novoSub = Number(totals.subtotal);
            const novoTot = novoSub + Number(pAtivo.taxa_entrega) - Number(pAtivo.desconto);
            await client.query(
              `UPDATE pedidos SET subtotal = $1, total = $2, updated_at = NOW()
               WHERE id = $3`,
              [novoSub, novoTot, pAtivo.id]
            );
            return {
              id: pAtivo.id,
              numero: pAtivo.numero,
              pontosGanhos: 0,        // não acumula pontos em rodadas extras
              acumulado: true,
              itens_adicionados: body.itens.length,
            };
          }
        }
      }

      // ── Validação server-side do cupom (nunca confia em desconto do cliente)
      let cupomId:  string | null = null;
      let desconto: number        = 0;

      if (body.cupom_codigo) {
        const cupom = await client.query<{
          id:                  string;
          tipo:                string;
          valor:               string;
          ativo:               boolean;
          valido_de:           string | null;
          valido_ate:          string | null;
          uso_maximo:          number | null;
          uso_atual:           number;
          uso_por_cliente:     number | null;
          valor_minimo_pedido: string | null;
          cliente_id:          string | null;
        }>(
          `SELECT id, tipo, valor, ativo, valido_de, valido_ate,
                  uso_maximo, uso_atual, uso_por_cliente,
                  valor_minimo_pedido, cliente_id
           FROM cupons
           WHERE empresa_id = $1 AND UPPER(codigo) = UPPER($2)
           LIMIT 1`,
          [empresa.id, body.cupom_codigo]
        ).then((r) => r.rows[0]);

        const agora = new Date();
        const cupomValido = cupom
          && cupom.ativo
          && (!cupom.valido_de  || new Date(cupom.valido_de)  <= agora)
          && (!cupom.valido_ate || new Date(cupom.valido_ate) >= agora)
          && (cupom.uso_maximo == null || cupom.uso_atual < cupom.uso_maximo)
          && (!cupom.cliente_id || cupom.cliente_id === body.cliente_id)
          && (cupom.valor_minimo_pedido == null || subtotal >= Number(cupom.valor_minimo_pedido));

        if (cupomValido) {
          cupomId = cupom.id;
          const valor = Number(cupom.valor);
          if (cupom.tipo === "percentual") {
            desconto = subtotal * (valor / 100);
          } else if (cupom.tipo === "fixo") {
            desconto = Math.min(valor, subtotal);
          }
          desconto = Math.round(desconto * 100) / 100;
        }
        // Se cupom inválido, prossegue sem desconto (não bloqueia o pedido)
      }

      const total = Math.max(0, subtotal - desconto);

      // Mapeia tipo do pedido
      const tipo = body.mesa_id
        ? "mesa"
        : body.tipo_consumo === "delivery"
          ? "delivery"
          : body.tipo_consumo === "retirada"
            ? "balcao"
            : "totem";

      // Pontos calculados sobre o total (após desconto)
      let pontosGanhos = 0;
      if (
        body.cliente_id &&
        empresa.fidelidade_ativo &&
        Number(empresa.pontos_por_real) > 0
      ) {
        pontosGanhos = Math.floor(total * Number(empresa.pontos_por_real));
      }

      // Insere pedido
      const rows = await client
        .query<{ id: string; numero: number }>(
          `INSERT INTO pedidos
             (empresa_id, tipo, status, mesa_id, cliente_id, cliente_nome, cliente_telefone,
              subtotal, desconto, taxa_entrega, total, pontos_ganhos, observacoes,
              forma_pagamento, tipo_consumo, cupom_id)
           VALUES ($1,$2,'pendente',$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12,$13,$14)
           RETURNING id, numero`,
          [
            empresa.id,
            tipo,
            body.mesa_id          ?? null,
            body.cliente_id       ?? null,
            body.cliente_nome     ?? null,
            body.cliente_telefone ?? null,
            subtotal,
            desconto,
            total,
            pontosGanhos,
            body.observacoes      ?? null,
            body.forma_pagamento  ?? null,
            body.tipo_consumo     ?? "local",
            cupomId,
          ]
        )
        .then((r) => r.rows);

      const row = rows[0];

      // Registra uso do cupom (e incrementa contador)
      if (cupomId) {
        await client.query(
          `INSERT INTO cupons_uso (cupom_id, pedido_id, cliente_id) VALUES ($1, $2, $3)`,
          [cupomId, row.id, body.cliente_id ?? null]
        );
        await client.query(
          `UPDATE cupons SET uso_atual = uso_atual + 1, updated_at = NOW() WHERE id = $1`,
          [cupomId]
        );
      }

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
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[]')`,
          [
            row.id,
            item.produto_id ?? null,
            item.nome,
            item.preco_unitario,
            item.quantidade,
            itemSubtotal,
            item.observacoes ?? null,
            JSON.stringify(item.adicionais ?? []),
          ]
        );
        if (item.produto_id) {
          await registrarSaidaEstoque(
            client, empresa.id, item.produto_id, row.id, item.quantidade
          );
        }
      }

      // Atualiza cliente — usa total (após desconto), não subtotal
      if (body.cliente_id) {
        await client.query(
          `UPDATE clientes SET
             total_pedidos    = total_pedidos + 1,
             total_gasto      = total_gasto + $1,
             ultimo_pedido_em = NOW(),
             pontos           = pontos + $2,
             updated_at       = NOW()
           WHERE id = $3`,
          [total, pontosGanhos, body.cliente_id]
        );
      }

      return { ...row, pontosGanhos };
    });

    return ok({
      id:           pedido.id,
      numero:       pedido.numero,
      pontos_ganhos: pedido.pontosGanhos,
      acumulado:    "acumulado" in pedido ? pedido.acumulado : false,
      itens_adicionados: "itens_adicionados" in pedido ? pedido.itens_adicionados : undefined,
    });
  } catch (err) {
    console.error("[Pub/Pedidos/POST]", err);
    return serverError();
  }
}
