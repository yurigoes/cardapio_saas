/**
 * Helper pra criar e enviar link de rastreio do delivery.
 * Token único por pedido, expira ao marcar entregue.
 */
import crypto from "crypto";
import { queryOne } from "@/lib/db/client";

interface CriarTokenResult {
  token: string;
  url:   string;
}

/**
 * Cria (ou recupera) token de rastreio pra um pedido.
 * Idempotente — mesmo pedido sempre devolve mesmo token até expirar.
 */
export async function obterTokenRastreio(empresaId: string, pedidoId: string): Promise<CriarTokenResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tthreedigital.com.br";

  // Tenta pegar existente ativo
  const existente = await queryOne<{ token: string }>(
    `SELECT token FROM rastreio_tokens
      WHERE pedido_id = $1 AND ativo = true LIMIT 1`,
    [pedidoId]
  );
  if (existente) {
    return { token: existente.token, url: `${baseUrl}/rastrear/${existente.token}` };
  }

  // Cria novo
  const token = crypto.randomBytes(16).toString("base64url");
  await queryOne(
    `INSERT INTO rastreio_tokens (pedido_id, empresa_id, token)
     VALUES ($1, $2, $3)
     ON CONFLICT (pedido_id) DO NOTHING`,
    [pedidoId, empresaId, token]
  );
  return { token, url: `${baseUrl}/rastrear/${token}` };
}

/**
 * Invalida tokens ao marcar pedido como entregue.
 */
export async function invalidarRastreio(pedidoId: string): Promise<void> {
  await queryOne(
    `UPDATE rastreio_tokens SET ativo = false WHERE pedido_id = $1`,
    [pedidoId]
  ).catch(() => {});
}

/**
 * Envia link de rastreio via Evolution pro telefone do cliente.
 */
export async function enviarLinkRastreio(empresaId: string, pedidoId: string): Promise<{ ok: boolean; url?: string; erro?: string }> {
  const pedido = await queryOne<{
    cliente_telefone: string | null;
    cliente_nome: string | null;
    numero: number | null;
    motoboy_nome: string | null;
    empresa_slug: string;
  }>(
    `SELECT p.cliente_telefone, p.cliente_nome, p.numero,
            mb.nome AS motoboy_nome,
            e.slug AS empresa_slug
       FROM pedidos p
       JOIN empresas e ON e.id = p.empresa_id
  LEFT JOIN motoboys mb ON mb.id = p.motoboy_id
      WHERE p.id = $1 AND p.empresa_id = $2`,
    [pedidoId, empresaId]
  );
  if (!pedido?.cliente_telefone) return { ok: false, erro: "pedido sem telefone do cliente" };

  const { url } = await obterTokenRastreio(empresaId, pedidoId);

  const evoUrl = process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const evoKey = process.env.EVOLUTION_API_KEY;
  if (!evoKey) return { ok: false, erro: "EVOLUTION_API_KEY não configurada" };

  const numero = pedido.cliente_telefone.startsWith("+")
    ? pedido.cliente_telefone.replace(/\D/g, "")
    : "55" + pedido.cliente_telefone.replace(/\D/g, "");

  const motoboyMsg = pedido.motoboy_nome
    ? `Seu entregador é o ${pedido.motoboy_nome}.\n\n`
    : "";

  const mensagem =
    `Olá ${pedido.cliente_nome ?? ""}! 🛵\n\n` +
    `Seu pedido #${pedido.numero ?? "?"} saiu para entrega!\n` +
    motoboyMsg +
    `Acompanhe em tempo real:\n${url}`;

  try {
    const r = await fetch(`${evoUrl}/message/sendText/${pedido.empresa_slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": evoKey },
      body: JSON.stringify({ number: numero, text: mensagem }),
    });
    if (!r.ok) return { ok: false, erro: `HTTP ${r.status}`, url };

    await queryOne(
      `UPDATE rastreio_tokens SET enviado_em = NOW() WHERE pedido_id = $1`,
      [pedidoId]
    ).catch(() => {});

    return { ok: true, url };
  } catch (err) {
    return { ok: false, erro: (err as Error).message, url };
  }
}
