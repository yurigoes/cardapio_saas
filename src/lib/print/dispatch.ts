/**
 * Dispatchers de impressão — carregam pedido + itens e enfileiram jobs
 * via enqueuePrint. Best-effort: nunca lançam (apenas logam) para não
 * travar o fluxo do pedido caso o agente esteja offline.
 */
import { query, queryOne } from "@/lib/db/client";
import { enqueuePrint, type SetorImpressora, type TipoCupom } from "@/lib/print/queue";
import {
  formatarCozinha, formatarCupomCliente,
  formatarFechamentoCaixa, formatarCupomMotoboySintetico, formatarCupomMotoboyAnalitico,
} from "@/lib/print/formatadores";

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

// Cascade de fallback: tenta o setor preferido, depois "balcao", depois
// QUALQUER impressora ativa da empresa. Pequenos restaurantes geralmente
// têm 1 impressora só, e essa fallback final é o que evita "nada imprime".
async function enqueueCascade(
  empresaId: string,
  pedidoId: string | undefined,
  conteudo: string,
  tipo: TipoCupom,
  setoresPreferidos: SetorImpressora[],
  formato: "escpos" | "text" = "text",
): Promise<{ jobIds: string[]; setor_usado: string | null }> {
  for (const setor of setoresPreferidos) {
    const ids = await enqueuePrint({ empresaId, pedidoId, setor, tipo, conteudo, formato });
    if (ids.length > 0) return { jobIds: ids, setor_usado: setor };
  }
  // Fallback: pega QUALQUER impressora ativa da empresa
  const qualquer = await query<{ id: string; setor: string }>(
    `SELECT id, setor FROM impressoras
      WHERE empresa_id = $1 AND ativa = true
      ORDER BY created_at LIMIT 1`,
    [empresaId]
  );
  if (qualquer.length > 0) {
    const ids = await enqueuePrint({
      empresaId, pedidoId, setor: qualquer[0].setor as SetorImpressora, tipo, conteudo, formato,
    });
    if (ids.length > 0) return { jobIds: ids, setor_usado: qualquer[0].setor };
  }
  return { jobIds: [], setor_usado: null };
}

/**
 * Enfileira cupom da cozinha (sem preço) ao criar um novo pedido.
 * Não bloqueia — chama em background.
 * Retorna info útil pro caller logar/avisar.
 */
export async function dispatchCupomCozinha(empresaId: string, pedidoId: string): Promise<{
  ok: boolean; jobs: number; setor_usado: string | null; motivo?: string;
}> {
  try {
    const data = await carregarPedido(empresaId, pedidoId);
    if (!data || data.itens.length === 0) {
      return { ok: false, jobs: 0, setor_usado: null, motivo: "pedido sem itens" };
    }

    const conteudo = formatarCozinha(data.empresaNome, {
      ...data.pedido,
      cliente_endereco: data.pedido.cliente_endereco ?? null,
      itens: data.itens,
      subtotal: 0, total: 0,
    });

    const { jobIds, setor_usado } = await enqueueCascade(
      empresaId, pedidoId, conteudo, "cozinha",
      ["cozinha", "balcao"],
    );
    if (jobIds.length === 0) {
      console.warn("[print/dispatch/cozinha] nenhuma impressora ativa", { empresaId, pedidoId });
      return { ok: false, jobs: 0, setor_usado: null, motivo: "nenhuma impressora ativa" };
    }
    return { ok: true, jobs: jobIds.length, setor_usado };
  } catch (err) {
    console.warn("[print/dispatch/cozinha]", (err as Error).message);
    return { ok: false, jobs: 0, setor_usado: null, motivo: (err as Error).message };
  }
}

/**
 * Enfileira cupom do cliente (com preços) ao fechar o pedido.
 * Cascata de setores: caixa → balcao → qualquer impressora ativa.
 */
export async function dispatchCupomCliente(
  empresaId: string,
  pedidoId: string,
  formaPagamento?: string,
): Promise<{ ok: boolean; jobs: number; setor_usado: string | null; motivo?: string }> {
  try {
    const data = await carregarPedido(empresaId, pedidoId);
    if (!data) return { ok: false, jobs: 0, setor_usado: null, motivo: "pedido não encontrado" };

    // ESC/POS binário com logo+QR depende de comandos não suportados em
    // todas impressoras (ex: EPSON TM-T20X ignora GS v 0). Usamos texto
    // plano com URL de acompanhamento. Pra logo+QR REAIS, usuário pode
    // imprimir via popup HTML do navegador (/imprimir/pedido/[id]?tipo=cliente).
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tthreedigital.com.br";
    const conteudo = formatarCupomCliente(data.empresaNome, {
      ...data.pedido,
      cliente_endereco: data.pedido.cliente_endereco ?? null,
      itens: data.itens,
      forma_pagamento: formaPagamento ?? null,
    }) + `\nAcompanhe: ${baseUrl}/p/${pedidoId}\n`;

    const { jobIds, setor_usado } = await enqueueCascade(
      empresaId, pedidoId, conteudo, "cupom",
      ["caixa", "balcao"],
    );
    if (jobIds.length === 0) {
      console.warn("[print/dispatch/cliente] nenhuma impressora ativa", { empresaId, pedidoId });
      return { ok: false, jobs: 0, setor_usado: null, motivo: "nenhuma impressora ativa" };
    }
    return { ok: true, jobs: jobIds.length, setor_usado };
  } catch (err) {
    console.warn("[print/dispatch/cliente]", (err as Error).message);
    return { ok: false, jobs: 0, setor_usado: null, motivo: (err as Error).message };
  }
}

/**
 * Cupom de fechamento de caixa — imprime no setor 'caixa'.
 */
export async function dispatchFechamentoCaixa(empresaId: string, caixaId: string): Promise<void> {
  try {
    const c = await queryOne<{
      empresa_nome: string;
      operador_abertura: string | null;
      operador_fechamento: string | null;
      aberto_em: string;
      fechado_em: string;
      valor_abertura: string;
      valor_esperado: string;
      valor_fechamento: string;
      diferenca: string;
      valores_esperados: Record<string, number> | null;
      valores_informados: Record<string, number> | null;
      diferencas_por_forma: Record<string, number> | null;
    }>(
      `SELECT e.nome_fantasia AS empresa_nome,
              ua.nome AS operador_abertura,
              uf.nome AS operador_fechamento,
              c.aberto_em, c.fechado_em,
              c.valor_abertura, c.valor_esperado, c.valor_fechamento, c.diferenca,
              c.valores_esperados, c.valores_informados, c.diferencas_por_forma
         FROM caixas c
         JOIN empresas e   ON e.id = c.empresa_id
    LEFT JOIN usuarios ua  ON ua.id = c.usuario_abertura_id
    LEFT JOIN usuarios uf  ON uf.id = c.usuario_fechamento_id
        WHERE c.id = $1 AND c.empresa_id = $2`,
      [caixaId, empresaId]
    );
    if (!c) return;

    // Reforços/sangrias
    const totals = await query<{ tipo: string; total: string }>(
      `SELECT tipo, COALESCE(SUM(valor), 0) AS total
         FROM caixa_movimentos WHERE caixa_id = $1 GROUP BY tipo`,
      [caixaId]
    );
    const sumByTipo = (t: string) => Number(totals.find(r => r.tipo === t)?.total ?? 0);

    const conteudo = formatarFechamentoCaixa({
      empresa:             c.empresa_nome,
      operador_abertura:   c.operador_abertura,
      operador_fechamento: c.operador_fechamento,
      aberto_em:           c.aberto_em,
      fechado_em:          c.fechado_em,
      valor_abertura:      c.valor_abertura,
      valor_esperado:      c.valor_esperado,
      valor_fechamento:    c.valor_fechamento,
      diferenca:           c.diferenca,
      reforcos:            sumByTipo("reforco"),
      sangrias:            sumByTipo("sangria"),
      esperados_por_forma:  c.valores_esperados ?? {},
      informados_por_forma: c.valores_informados,
      diferencas_por_forma: c.diferencas_por_forma,
    });

    await enqueueCascade(
      empresaId, undefined, conteudo, "cupom",
      ["caixa", "balcao"],
    );
  } catch (err) {
    console.warn("[print/dispatch/fechamento]", (err as Error).message);
  }
}

/**
 * Cupom de relatório de motoboy (sintético ou analítico).
 */
export async function dispatchRelatorioMotoboy(
  empresaId: string,
  motoboyId: string,
  data: string,                    // YYYY-MM-DD
  formato: "sintetico" | "analitico",
): Promise<void> {
  try {
    const empresa = await queryOne<{ nome_fantasia: string }>(
      `SELECT nome_fantasia FROM empresas WHERE id = $1`, [empresaId]
    );
    const motoboy = await queryOne<{ nome: string }>(
      `SELECT nome FROM motoboys WHERE id = $1 AND empresa_id = $2`,
      [motoboyId, empresaId]
    );
    if (!empresa || !motoboy) return;

    const corridas = await query<{
      pedido_numero: number | null;
      cliente_nome:  string | null;
      cliente_endereco: { rua?: string; numero?: string; bairro?: string } | null;
      taxa_entrega:  string;
      total:         string;
      status:        string;
      created_at:    string;
    }>(
      `SELECT numero AS pedido_numero, cliente_nome, cliente_endereco,
              COALESCE(taxa_entrega, 0) AS taxa_entrega,
              total, status, created_at
         FROM pedidos
        WHERE empresa_id = $1 AND motoboy_id = $2
          AND DATE(created_at AT TIME ZONE 'America/Bahia') = $3::date
          AND deleted_at IS NULL
        ORDER BY created_at`,
      [empresaId, motoboyId, data]
    );

    const totalTaxas = corridas.reduce((acc, c) => acc + Number(c.taxa_entrega), 0);

    const resumo = {
      empresa:        empresa.nome_fantasia,
      motoboy_nome:   motoboy.nome,
      data,
      total_corridas: corridas.length,
      total_taxas:    totalTaxas,
      corridas: corridas.map(c => ({
        pedido_numero: c.pedido_numero,
        cliente_nome:  c.cliente_nome,
        endereco:      c.cliente_endereco
          ? [c.cliente_endereco.rua, c.cliente_endereco.numero, c.cliente_endereco.bairro].filter(Boolean).join(", ")
          : null,
        taxa_entrega:  c.taxa_entrega,
        total_pedido:  c.total,
        status:        c.status,
        hora:          new Date(c.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      })),
    };

    const conteudo = formato === "analitico"
      ? formatarCupomMotoboyAnalitico(resumo)
      : formatarCupomMotoboySintetico(resumo);

    await enqueuePrint({ empresaId, setor: "caixa", tipo: "cupom", conteudo });
  } catch (err) {
    console.warn("[print/dispatch/motoboy]", (err as Error).message);
  }
}

