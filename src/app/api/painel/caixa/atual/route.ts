/**
 * GET /api/painel/caixa/atual
 *
 * Retorna o caixa aberto da empresa (se houver) com totais agregados:
 *   - movimentos por tipo (sangria, reforco, venda, estorno)
 *   - vendas por forma de pagamento (dinheiro, pix, etc.)
 *   - saldo esperado (abertura + reforços + vendas em dinheiro - sangrias - estornos)
 *
 * Retorna { caixa: null } se não houver caixa aberto.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne, query } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

interface CaixaRow {
  id:                    string;
  usuario_abertura_id:   string;
  usuario_abertura_nome: string | null;
  valor_abertura:        string | number;
  observacoes:           string | null;
  aberto_em:             string;
  status:                string;
}

interface MovTipoRow { tipo: string; total: string | number; }
interface MovFormaRow { forma_pagamento: string | null; total: string | number; }

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const caixa = await queryOne<CaixaRow>(
      `SELECT c.id, c.usuario_abertura_id, u.nome AS usuario_abertura_nome,
              c.valor_abertura, c.observacoes, c.aberto_em, c.status
       FROM caixas c
       LEFT JOIN usuarios u ON u.id = c.usuario_abertura_id
       WHERE c.empresa_id = $1 AND c.status = 'aberto'
       ORDER BY c.aberto_em DESC LIMIT 1`,
      [empresaId]
    );

    if (!caixa) return ok({ caixa: null });

    // Totais por tipo de movimento
    const totaisTipo = await query<MovTipoRow>(
      `SELECT tipo, COALESCE(SUM(valor), 0) AS total
       FROM caixa_movimentos
       WHERE caixa_id = $1
       GROUP BY tipo`,
      [caixa.id]
    );

    // Vendas detalhadas por forma de pagamento
    const totaisForma = await query<MovFormaRow>(
      `SELECT forma_pagamento, COALESCE(SUM(valor), 0) AS total
       FROM caixa_movimentos
       WHERE caixa_id = $1 AND tipo = 'venda'
       GROUP BY forma_pagamento`,
      [caixa.id]
    );

    const sumByTipo = (t: string) =>
      Number(totaisTipo.find((r) => r.tipo === t)?.total ?? 0);

    const reforcos = sumByTipo("reforco");
    const sangrias = sumByTipo("sangria");
    const estornos = sumByTipo("estorno");

    const vendasPorForma: Record<string, number> = {};
    let totalVendas = 0;
    let vendasDinheiro = 0;
    for (const r of totaisForma) {
      const k = r.forma_pagamento ?? "outro";
      const v = Number(r.total);
      vendasPorForma[k] = v;
      totalVendas += v;
      if (k === "dinheiro") vendasDinheiro = v;
    }

    // Saldo esperado em dinheiro:
    //   abertura + reforços + vendas-em-dinheiro - sangrias - estornos
    const saldoEsperado = Math.round(
      (Number(caixa.valor_abertura) + reforcos + vendasDinheiro - sangrias - estornos) * 100
    ) / 100;

    return ok({
      caixa: {
        id:                    caixa.id,
        usuario_abertura_id:   caixa.usuario_abertura_id,
        usuario_abertura_nome: caixa.usuario_abertura_nome,
        valor_abertura:        Number(caixa.valor_abertura),
        observacoes:           caixa.observacoes,
        aberto_em:             caixa.aberto_em,
        status:                caixa.status,
        // Totais
        reforcos,
        sangrias,
        estornos,
        total_vendas:          totalVendas,
        vendas_dinheiro:       vendasDinheiro,
        vendas_por_forma:      vendasPorForma,
        saldo_esperado:        saldoEsperado,
      },
    });
  } catch (err) {
    console.error("[Caixa/Atual/GET]", err);
    return serverError();
  }
}
