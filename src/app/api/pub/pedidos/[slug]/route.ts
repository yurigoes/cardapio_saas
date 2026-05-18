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
import { ok, notFound, badRequest, serverError, tooManyRequests } from "@/lib/utils/response";
import { checkRateLimitByRequest, PUB_PEDIDO_RATE_LIMIT } from "@/lib/security/rate-limit";
import { recordPedido } from "@/lib/observability/metrics";
import { EMPRESA_OPERACIONAL_SQL } from "@/lib/billing/empresa-acesso";
import { registrarSaidaEstoque } from "@/lib/estoque/movimento";
import { idempotencyEnter } from "@/lib/idempotency";
import { enviarPushParaUsuariosDaEmpresa } from "@/lib/push";
import { creditarCashbackPedido, debitarCashbackPedido } from "@/lib/cashback/movimento";
import { notificarEvolution } from "@/lib/notify/evolution";
import { dispatchCupomCozinha, dispatchCupomCliente } from "@/lib/print/dispatch";
import { lookupZonaParaEndereco } from "@/lib/delivery/lookup-zona";
import { geocodeEndereco } from "@/lib/delivery/geocode";
import crypto from "crypto";
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
  cliente_endereco: z.object({
    cep:         z.string().max(10).optional(),
    rua:         z.string().max(200).optional(),
    numero:      z.string().max(20).optional(),
    complemento: z.string().max(100).optional(),
    bairro:      z.string().max(100).optional(),
    cidade:      z.string().max(100).optional(),
    uf:          z.string().max(2).optional(),
    referencia:  z.string().max(200).optional(),
  }).partial().optional(),

  /* Pedido */
  observacoes:      z.string().max(1000).trim().optional().transform((v) => v || undefined),
  mesa_id:          uuidOpt,
  cupom_codigo:     z.string().max(50).trim().optional().transform((v) => v || undefined),
  desconto:         precoLenient.optional(),
  cashback_usar:    precoLenient.optional(),  // valor em R$ a debitar do saldo
  itens:            z.array(itemSchema).min(1, "Pedido deve ter ao menos 1 item"),
});

// ── handler ───────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // Idempotency — se cliente (totem ou retaguarda worker) já mandou esta
  // chave e o pedido foi processado, devolvemos a MESMA resposta sem criar
  // pedido duplicado. Garante segurança no retry do buffer offline.
  const idem = await idempotencyEnter(req, "pedido");
  if (idem.cached) return idem.cached;

  // Rate limit por IP — anti-DoS no cardápio público
  const rl = await checkRateLimitByRequest(req, PUB_PEDIDO_RATE_LIMIT);
  if (!rl.success) return tooManyRequests(rl);

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
      taxa_entrega:       string;
    }>(
      `SELECT id,
              COALESCE(pontos_por_real, 0)        AS pontos_por_real,
              COALESCE(fidelidade_ativo, false)   AS fidelidade_ativo,
              COALESCE(caixa_obrigatorio, false)  AS caixa_obrigatorio,
              COALESCE(taxa_entrega, 0)           AS taxa_entrega
       FROM empresas
       WHERE slug = $1 AND deleted_at IS NULL AND ${EMPRESA_OPERACIONAL_SQL}`,
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

      // Mapeia tipo do pedido
      const tipo = body.mesa_id
        ? "mesa"
        : body.tipo_consumo === "delivery"
          ? "delivery"
          : body.tipo_consumo === "retirada"
            ? "balcao"
            : "totem";

      // Taxa de entrega: tenta zona específica (CEP/bairro), senão usa empresa.taxa_entrega
      let taxaEntrega = 0;
      let zonaId: string | null = null;
      let valorMotoboy = 0;
      let enderecoComCoords: (typeof body.cliente_endereco & { lat?: number; lng?: number }) | undefined =
        body.cliente_endereco;
      if (tipo === "delivery") {
        const zona = await lookupZonaParaEndereco(empresa.id, body.cliente_endereco ?? null);
        if (zona) {
          taxaEntrega  = zona.valor_cobrado;
          zonaId       = zona.id;
          valorMotoboy = zona.valor_motoboy;
        } else {
          taxaEntrega = Number(empresa.taxa_entrega);
        }
        // Geocode best-effort (Nominatim ~1s) — não bloqueia se falhar
        if (body.cliente_endereco) {
          try {
            const coords = await geocodeEndereco(body.cliente_endereco);
            if (coords) {
              enderecoComCoords = { ...body.cliente_endereco, lat: coords.lat, lng: coords.lng };
            }
          } catch { /* ignore */ }
        }
      }
      const total = Math.max(0, subtotal + taxaEntrega - desconto);

      // Tracking token para delivery (cliente acompanha em tempo real)
      const trackingToken = tipo === "delivery"
        ? crypto.randomBytes(12).toString("base64url")
        : null;

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
              cliente_endereco,
              subtotal, desconto, taxa_entrega, total, pontos_ganhos, observacoes,
              forma_pagamento, tipo_consumo, cupom_id,
              zona_id, status_entrega, tracking_token, valor_motoboy)
           VALUES ($1,$2,'pendente',$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                   $17,$18,$19,$20)
           RETURNING id, numero`,
          [
            empresa.id,
            tipo,
            body.mesa_id          ?? null,
            body.cliente_id       ?? null,
            body.cliente_nome     ?? null,
            body.cliente_telefone ?? null,
            enderecoComCoords ? JSON.stringify(enderecoComCoords) : null,
            subtotal,
            desconto,
            taxaEntrega,
            total,
            pontosGanhos,
            body.observacoes      ?? null,
            body.forma_pagamento  ?? null,
            body.tipo_consumo     ?? "local",
            cupomId,
            zonaId,
            tipo === "delivery" ? "aguardando" : null,
            trackingToken,
            valorMotoboy,
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
      // Persiste endereço quando vier (delivery) — vira "endereço padrão" pra próxima
      if (body.cliente_id) {
        const enderecoJson = body.cliente_endereco
          ? JSON.stringify(body.cliente_endereco)
          : null;
        await client.query(
          `UPDATE clientes SET
             total_pedidos    = total_pedidos + 1,
             total_gasto      = total_gasto + $1,
             ultimo_pedido_em = NOW(),
             pontos           = pontos + $2,
             endereco         = COALESCE($4::jsonb, endereco),
             updated_at       = NOW()
           WHERE id = $3`,
          [total, pontosGanhos, body.cliente_id, enderecoJson]
        );
      }

      // ── Cashback ──────────────────────────────────────────────────────
      let cashbackCreditado = 0;
      let cashbackDebitado  = 0;
      if (body.cliente_id) {
        // Débito (uso do saldo como desconto) — valida server-side
        if (body.cashback_usar && body.cashback_usar > 0) {
          // Não debita mais que o total do pedido (evita pedido negativo)
          const max = Math.min(body.cashback_usar, total);
          const deb = await debitarCashbackPedido(
            client, empresa.id, body.cliente_id, row.id, max
          );
          if (deb.debitado) cashbackDebitado = deb.valor ?? 0;
        }

        // Se houve débito, atualiza pedido (subtrai do total, soma ao desconto)
        if (cashbackDebitado > 0) {
          const novoDesc  = desconto + cashbackDebitado;
          const novoTotal = Math.max(0, total - cashbackDebitado);
          await client.query(
            `UPDATE pedidos SET desconto = $1, total = $2, updated_at = NOW()
             WHERE id = $3`,
            [novoDesc, novoTotal, row.id]
          );
        }

        // Crédito (ganho na compra) — baseia no total real (pós desconto/cashback)
        const totalParaCredito = Math.max(0, total - cashbackDebitado);
        const cb = await creditarCashbackPedido(
          client, empresa.id, body.cliente_id, row.id, totalParaCredito
        );
        if (cb.creditado) cashbackCreditado = cb.valor ?? 0;
      }

      return { ...row, pontosGanhos, cashbackCreditado, cashbackDebitado, trackingToken };
    });

    // Notificação Web Push (não bloqueia resposta)
    if (!("acumulado" in pedido && pedido.acumulado)) {
      enviarPushParaUsuariosDaEmpresa(empresa.id, {
        title: `Novo pedido #${pedido.numero}`,
        body:  body.cliente_nome
          ? `${body.cliente_nome} · ${body.tipo_consumo ?? "local"}`
          : `${body.tipo_consumo ?? "local"} · ${body.itens.length} item(s)`,
        url:   `/painel/pedidos`,
        tag:   "pedido-novo",
      }).catch(e => console.warn("[Push] erro:", e));

      // WhatsApp para o dono via Evolution (best-effort)
      const totalCalc = body.itens.reduce(
        (a, i) => a + i.preco_unitario * i.quantidade, 0
      ) - (body.desconto ?? 0) - (body.cashback_usar ?? 0);

      // novo_pedido só dispara se houver cliente identificado no CRM (cliente_id).
      // Walk-in anônimos não disparam — evita spam pro dono.
      if (body.cliente_id) {
        notificarEvolution(empresa.id, "novo_pedido", {
          clienteNome:  body.cliente_nome ?? null,
          pedidoNumero: pedido.numero,
          pedidoId:     pedido.id,
          total:        totalCalc,
        }).catch(e => console.warn("[Pub/Pedidos] notify novo_pedido:", e));
      }

      // PRINT: dispara imediatamente em cenários seguros:
      //   - Formas síncronas (dinheiro, pinpad, etc) — pago na hora
      //   - Pedidos via TOTEM físico (origem='totem' ou tipo='totem'):
      //     totem só finaliza pedido APÓS confirmar pagamento na tela,
      //     então sempre seguro imprimir.
      // PIX/cartão online de delivery aguardam webhook do gateway.
      const SINCRONAS = new Set(["dinheiro", "pagar_entrega", "pinpad", "cartao_maquina"]);
      const formaSincrona = !!body.forma_pagamento && SINCRONAS.has(body.forma_pagamento);
      // Totem = sem mesa, sem delivery, sem retirada (default fica "totem")
      const eTotem = !body.mesa_id && body.tipo_consumo !== "delivery" && body.tipo_consumo !== "retirada";
      // PIX nativo no totem (sem mesa, sem delivery): cliente está fisicamente
      // na loja vendo o QR — imprime cozinha/caixa imediatamente. Pra delivery
      // continua aguardando webhook do gateway.
      const pixNoLocal = body.forma_pagamento === "pix"
                      && !body.mesa_id
                      && body.tipo_consumo !== "delivery";
      const podeImprimir = formaSincrona || eTotem || pixNoLocal;

      if (podeImprimir) {
        dispatchCupomCozinha(empresa.id, pedido.id)
          .catch(e => console.warn("[Pub/Pedidos] print cozinha:", e));
        dispatchCupomCliente(empresa.id, pedido.id)
          .catch(e => console.warn("[Pub/Pedidos] print cliente:", e));
        console.info(
          `[Pub/Pedidos] pedido=${pedido.id} imprimiu (totem=${eTotem} forma=${body.forma_pagamento ?? "?"})`
        );
      } else {
        console.info(
          `[Pub/Pedidos] pedido=${pedido.id} forma=${body.forma_pagamento ?? "(indefinida)"} ` +
          `aguarda webhook pra imprimir`
        );
      }
    }

    const respPayload = {
      id:           pedido.id,
      numero:       pedido.numero,
      tracking_token: "trackingToken" in pedido ? pedido.trackingToken : null,
      pontos_ganhos: pedido.pontosGanhos,
      cashback_creditado: "cashbackCreditado" in pedido ? pedido.cashbackCreditado : 0,
      cashback_debitado:  "cashbackDebitado"  in pedido ? pedido.cashbackDebitado  : 0,
      acumulado:    "acumulado" in pedido ? pedido.acumulado : false,
      itens_adicionados: "itens_adicionados" in pedido ? pedido.itens_adicionados : undefined,
    };
    // Grava resposta no cache de idempotency pra retries seguros do worker offline
    await idem.save({ success: true, data: respPayload }, 200);
    return ok(respPayload);
  } catch (err) {
    console.error("[Pub/Pedidos/POST]", err);
    return serverError();
  }
}
