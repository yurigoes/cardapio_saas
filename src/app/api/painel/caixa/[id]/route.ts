/**
 * GET /api/painel/caixa/[id]
 *
 * Detalhe completo de um caixa (aberto ou fechado):
 *   - dados do caixa
 *   - usuários de abertura/fechamento
 *   - lista de movimentos com filtros opcionais
 *   - totais agregados (vendas por forma, sangrias, reforços, estornos)
 *
 * Útil para auditoria de turnos passados.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";

interface CaixaRow {
  id:                       string;
  status:                   string;
  valor_abertura:           string;
  valor_esperado:           string | null;
  valor_fechamento:         string | null;
  diferenca:                string | null;
  observacoes:              string | null;
  observacoes_fechamento:   string | null;
  aberto_em:                string;
  fechado_em:               string | null;
  usuario_abertura_nome:    string | null;
  usuario_fechamento_nome:  string | null;
}

interface MovRow {
  id:              string;
  tipo:            string;
  forma_pagamento: string | null;
  valor:           string;
  descricao:       string | null;
  pedido_id:       string | null;
  pedido_numero:   number | null;
  usuario_nome:    string | null;
  criado_em:       string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "caixa:abrir")) return forbidden();

  try {
    const caixa = await queryOne<CaixaRow>(
      `SELECT c.id, c.status,
              c.valor_abertura, c.valor_esperado, c.valor_fechamento, c.diferenca,
              c.observacoes, c.observacoes_fechamento,
              c.aberto_em, c.fechado_em,
              ua.nome AS usuario_abertura_nome,
              uf.nome AS usuario_fechamento_nome
       FROM caixas c
       LEFT JOIN usuarios ua ON ua.id = c.usuario_abertura_id
       LEFT JOIN usuarios uf ON uf.id = c.usuario_fechamento_id
       WHERE c.id = $1 AND c.empresa_id = $2`,
      [params.id, empresaId]
    );

    if (!caixa) return notFound("Caixa não encontrado");

    const movimentos = await query<MovRow>(
      `SELECT m.id, m.tipo, m.forma_pagamento, m.valor, m.descricao,
              m.pedido_id, p.numero AS pedido_numero,
              u.nome AS usuario_nome,
              m.criado_em
       FROM caixa_movimentos m
       LEFT JOIN pedidos p ON p.id = m.pedido_id
       LEFT JOIN usuarios u ON u.id = m.usuario_id
       WHERE m.caixa_id = $1
       ORDER BY m.criado_em DESC
       LIMIT 500`,
      [params.id]
    );

    // Agregados por tipo + por forma de pagamento
    const totaisTipo: Record<string, number> = { sangria: 0, reforco: 0, venda: 0, estorno: 0 };
    const totaisForma: Record<string, number> = {};

    for (const m of movimentos) {
      const v = Number(m.valor);
      totaisTipo[m.tipo] = (totaisTipo[m.tipo] ?? 0) + v;
      if (m.tipo === "venda") {
        const k = m.forma_pagamento ?? "outro";
        totaisForma[k] = (totaisForma[k] ?? 0) + v;
      }
    }

    return ok({
      caixa: {
        ...caixa,
        valor_abertura:   Number(caixa.valor_abertura),
        valor_esperado:   caixa.valor_esperado   != null ? Number(caixa.valor_esperado)   : null,
        valor_fechamento: caixa.valor_fechamento != null ? Number(caixa.valor_fechamento) : null,
        diferenca:        caixa.diferenca        != null ? Number(caixa.diferenca)        : null,
      },
      movimentos: movimentos.map((m) => ({ ...m, valor: Number(m.valor) })),
      totais: {
        por_tipo:  totaisTipo,
        por_forma: totaisForma,
      },
    });
  } catch (err) {
    console.error("[Caixa/Detail]", err);
    return serverError();
  }
}
