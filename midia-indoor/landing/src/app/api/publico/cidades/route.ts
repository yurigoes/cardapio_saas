/**
 * GET /api/publico/cidades — endpoint publico, agrupa locais por cidade.
 * Em vez de expor a lista nominal de cada totem (que vira "alvo" pra
 * concorrencia + revela info sensivel), mostra so:
 *   - cidade
 *   - N_TELAS: numero TOTAL de telas (somando todos os locais da cidade)
 *   - N_LOCAIS: numero de pontos
 *   - tipos_telas: ['retrato', 'paisagem'] (so pra saber que orientacoes existem)
 *
 * Filtro: archived_at IS NULL AND ativo = true (so locais ativos).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  await ensureSchema();
  const rows = await db().query<{
    cidade: string | null;
    n_locais: number;
    n_telas: number;
    orientacoes: string[];
  }>(
    `SELECT l.cidade,
            COUNT(DISTINCT l.id)::int AS n_locais,
            COALESCE(SUM(
              (SELECT COUNT(*) FROM midia_telas t
                WHERE t.local_id = l.id AND t.xibo_display_id IS NOT NULL)
            ), 0)::int AS n_telas,
            array_agg(DISTINCT l.orientacao) FILTER (WHERE l.orientacao IS NOT NULL) AS orientacoes
       FROM midia_locais l
      WHERE l.archived_at IS NULL AND l.ativo = true
        AND (l.tipo IS NULL OR l.tipo='individual')
   GROUP BY l.cidade
   ORDER BY l.cidade NULLS LAST`
  ).then(r => r.rows);

  // Filtra cidade nula (vira "Outros") e cidades sem nenhuma tela ainda (nao
  // adianta mostrar "Salvador · 0 telas" pro publico).
  const cidades = rows
    .filter(r => r.n_telas > 0)
    .map(r => ({
      cidade: r.cidade ?? "Outros",
      n_telas: r.n_telas,
      n_locais: r.n_locais,
      orientacoes: r.orientacoes ?? [],
    }));

  return NextResponse.json({ ok: true, cidades, total_telas: cidades.reduce((s, c) => s + c.n_telas, 0) });
}
