/**
 * Dispatchers de impressão — carregam pedido + itens e enfileiram jobs
 * via enqueuePrint. Best-effort: nunca lançam (apenas logam) para não
 * travar o fluxo do pedido caso o agente esteja offline.
 */
import { query, queryOne } from "@/lib/db/client";
import { enqueuePrint } from "@/lib/print/queue";
import { formatarCozinha, formatarCupomCliente } from "@/lib/print/formatadores";

interface PedidoRow {
  id: string;
  numero: number | null;
  tipo: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_endereco: Record<string, string> | null;
  observacoes: string | null;
  subtotal: string | number;
  desconto: string | number;
  taxa_entrega: string | number;
  total: string | number;
  mesa_numero: number | null;
}

interface ItemRow {
  nome: string;
  quantidade: number;
  preco_unitario: string | number;
  observacoes: string | null;
}

async function carregarPedido(empresaId: string, pedidoId: string) {
  const pedido = await queryOne<PedidoRow>(
    `SELECT p.id, p.numero, p.tipo, p.cliente_nome, p.cliente_telefone,
            p.cliente_endereco, p.observacoes, p.subtotal, p.desconto,
            p.taxa_entrega, p.total, m.numero AS mesa_numero
       FROM pedidos p
       LEFT JOIN mesas m ON m.id = p.mesa_id
      WHERE p.id = $1 AND p.empresa_id = $2`,
    [pedidoId, empresaId]
  );
  if (!pedido) return null;

  const itens = await query<ItemRow>(
    `SELECT nome, quantidade, preco_unitario, observacoes
       FROM pedido_itens WHERE pedido_id = $1 ORDER BY id`,
    [pedidoId]
  );

  const empresa = await queryOne<{ nome_fantasia: string | null; razao_social: string | null }>(
    `SELECT nome_fantasia, razao_social FROM empresas WHERE id = $1`,
    [empresaId]
  );

  return {
    pedido,
    itens,
    empresaNome: empresa?.nome_fantasia || empresa?.razao_social || "Estabelecimento",
  };
}

/**
 * Enfileira cupom da cozinha (sem preço) ao criar um novo pedido.
 * Não bloqueia — chama em background.
 */
export async function dispatchCupomCozinha(empresaId: string, pedidoId: string): Promise<void> {
  try {
    const data = await carregarPedido(empresaId, pedidoId);
    if (!data || data.itens.length === 0) return;

    const conteudo = formatarCozinha(data.empresaNome, {
      ...data.pedido,
      cliente_endereco: data.pedido.cliente_endereco ?? null,
      itens: data.itens,
      subtotal: 0, total: 0, // cozinha ignora
    });

    await enqueuePrint({
      empresaId, pedidoId,
      setor:    "cozinha",
      tipo:     "cozinha",
      conteudo,
    });
  } catch (err) {
    console.warn("[print/dispatch/cozinha]", (err as Error).message);
  }
}

/**
 * Enfileira cupom do cliente (com preços) ao fechar o pedido.
 * Setor padrão: 'caixa' (cai em 'balcao' como fallback se caixa não tem impressora).
 */
export async function dispatchCupomCliente(
  empresaId: string,
  pedidoId: string,
  formaPagamento?: string,
): Promise<void> {
  try {
    const data = await carregarPedido(empresaId, pedidoId);
    if (!data) return;

    const conteudo = formatarCupomCliente(data.empresaNome, {
      ...data.pedido,
      cliente_endereco: data.pedido.cliente_endereco ?? null,
      itens: data.itens,
      forma_pagamento: formaPagamento ?? null,
    });

    // tenta caixa primeiro; se não tem nenhuma ativa, cai em balcao
    const ids = await enqueuePrint({
      empresaId, pedidoId,
      setor:    "caixa",
      tipo:     "cupom",
      conteudo,
    });
    if (ids.length === 0) {
      await enqueuePrint({
        empresaId, pedidoId,
        setor:    "balcao",
        tipo:     "cupom",
        conteudo,
      });
    }
  } catch (err) {
    console.warn("[print/dispatch/cliente]", (err as Error).message);
  }
}
