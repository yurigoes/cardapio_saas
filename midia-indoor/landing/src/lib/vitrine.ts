/**
 * Dados públicos pra landing institucional (rede de mídia).
 * Tudo com fallback silencioso (landing nunca quebra por falta de banco).
 */
import { db, ensureSchema } from "./db";

export interface LocalVitrine { nome: string; cidade: string | null; }
export interface PacoteVitrine { id: string; nome: string; tipo: string; dias: number; insercoes_dia: number; segundos: number; preco: number; }
export interface CidadeVitrine { cidade: string; n_telas: number; n_locais: number; orientacoes: string[]; }

export async function locaisVitrine(): Promise<LocalVitrine[]> {
  try {
    await ensureSchema();
    const { rows } = await db().query<LocalVitrine>(
      `SELECT nome, cidade FROM midia_locais WHERE ativo = true ORDER BY cidade NULLS LAST, nome`
    );
    return rows;
  } catch { return []; }
}

/** Lista para a landing institucional: cidade + N telas + N locais.
 *  Nao expoe nome dos totens (estrategia comercial). */
export async function cidadesVitrine(): Promise<CidadeVitrine[]> {
  try {
    await ensureSchema();
    const { rows } = await db().query<{ cidade: string | null; n_locais: number; n_telas: number; orientacoes: string[] | null }>(
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
    );
    return rows
      .filter(r => r.n_telas > 0)
      .map(r => ({
        cidade: r.cidade ?? "Outros",
        n_telas: r.n_telas,
        n_locais: r.n_locais,
        orientacoes: r.orientacoes ?? [],
      }));
  } catch { return []; }
}

export async function pacotesVitrine(): Promise<PacoteVitrine[]> {
  try {
    await ensureSchema();
    const { rows } = await db().query<PacoteVitrine & { preco: string }>(
      `SELECT id, nome, tipo, dias, insercoes_dia, segundos, preco FROM midia_pacotes WHERE ativo = true ORDER BY ordem, preco`
    );
    return rows.map(r => ({ ...r, preco: Number(r.preco) }));
  } catch { return []; }
}
