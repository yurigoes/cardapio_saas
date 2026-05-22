/**
 * Dados públicos pra landing institucional (rede de mídia).
 * Tudo com fallback silencioso (landing nunca quebra por falta de banco).
 */
import { db, ensureSchema } from "./db";

export interface LocalVitrine { nome: string; cidade: string | null; }
export interface PacoteVitrine { id: string; nome: string; tipo: string; dias: number; insercoes_dia: number; segundos: number; preco: number; }

export async function locaisVitrine(): Promise<LocalVitrine[]> {
  try {
    await ensureSchema();
    const { rows } = await db().query<LocalVitrine>(
      `SELECT nome, cidade FROM midia_locais WHERE ativo = true ORDER BY cidade NULLS LAST, nome`
    );
    return rows;
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
