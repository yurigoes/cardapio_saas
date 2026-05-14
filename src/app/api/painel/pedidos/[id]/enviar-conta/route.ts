/**
 * POST /api/painel/pedidos/[id]/enviar-conta
 *
 * Envia a conta (texto + link de rastreio) pelo WhatsApp do cliente
 * via Evolution. Substitui a função 'imprimir conta' nos casos de
 * delivery onde o cliente nem está no balcão.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne, query } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { obterTokenRastreio } from "@/lib/delivery/rastreio";

interface PedidoRow {
  id: string; numero: number | null; tipo: string;
  cliente_nome: string | null; cliente_telefone: string | null;
  total: string; subtotal: string; desconto: string; taxa_entrega: string;
  observacoes: string | null;
  empresa_slug: string;
  empresa_nome: string;
  motoboy_nome: string | null;
  motoboy_telefone: string | null;
}

const fmtBRL = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  const pedido = await queryOne<PedidoRow>(
    `SELECT p.id, p.numero, p.tipo,
            p.cliente_nome, p.cliente_telefone,
            p.total, p.subtotal, COALESCE(p.desconto, 0) AS desconto,
            COALESCE(p.taxa_entrega, 0) AS taxa_entrega, p.observacoes,
            e.slug AS empresa_slug, e.nome_fantasia AS empresa_nome,
            mb.nome AS motoboy_nome, mb.telefone AS motoboy_telefone
       FROM pedidos p
       JOIN empresas e ON e.id = p.empresa_id
  LEFT JOIN motoboys mb ON mb.id = p.motoboy_id
      WHERE p.id = $1 AND p.empresa_id = $2 AND p.deleted_at IS NULL`,
    [params.id, empresaId]
  );
  if (!pedido) return notFound("Pedido não encontrado");
  if (!pedido.cliente_telefone) return badRequest("Pedido sem telefone do cliente cadastrado");

  // Itens
  const itens = await query<{ nome: string; quantidade: number; preco_unitario: string }>(
    `SELECT nome, quantidade, preco_unitario FROM pedido_itens WHERE pedido_id = $1 ORDER BY id`,
    [params.id]
  );

  // Token rastreio (se for delivery)
  let urlRastreio = "";
  if (pedido.tipo === "delivery") {
    const t = await obterTokenRastreio(empresaId, params.id);
    urlRastreio = t.url;
  }

  // Monta mensagem
  let msg = `Olá ${pedido.cliente_nome ?? ""}! 👋\n\n`;
  msg += `📋 *Pedido #${pedido.numero ?? "?"}* — ${pedido.empresa_nome}\n\n`;
  for (const it of itens) {
    const sub = Number(it.preco_unitario) * it.quantidade;
    msg += `• ${it.quantidade}x ${it.nome} — ${fmtBRL(sub)}\n`;
  }
  msg += `\n*Subtotal:* ${fmtBRL(pedido.subtotal)}\n`;
  if (Number(pedido.desconto) > 0)     msg += `Desconto: -${fmtBRL(pedido.desconto)}\n`;
  if (Number(pedido.taxa_entrega) > 0) msg += `Taxa entrega: ${fmtBRL(pedido.taxa_entrega)}\n`;
  msg += `*TOTAL: ${fmtBRL(pedido.total)}*\n`;

  if (pedido.motoboy_nome) {
    msg += `\n🛵 Entregador: ${pedido.motoboy_nome}\n`;
  }
  if (urlRastreio) {
    msg += `\n📍 Acompanhe a entrega:\n${urlRastreio}\n`;
  }
  msg += `\nObrigado pela preferência! 🙏`;

  // Envia via Evolution
  const evoUrl = process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const evoKey = process.env.EVOLUTION_API_KEY;
  if (!evoKey) return serverError("EVOLUTION_API_KEY não configurada");

  const numero = pedido.cliente_telefone.startsWith("+")
    ? pedido.cliente_telefone.replace(/\D/g, "")
    : "55" + pedido.cliente_telefone.replace(/\D/g, "");

  try {
    const r = await fetch(`${evoUrl}/message/sendText/${pedido.empresa_slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": evoKey },
      body: JSON.stringify({ number: numero, text: msg }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return serverError(`Falha Evolution: ${txt.slice(0, 200)}`);
    }
    return ok({
      enviado: true, telefone: numero,
      url_rastreio: urlRastreio || null,
      mensagem: "Conta enviada via WhatsApp",
    });
  } catch (err) {
    console.error("[Pedidos/EnviarConta]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
