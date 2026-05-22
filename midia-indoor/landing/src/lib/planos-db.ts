/**
 * Acesso aos planos no banco (gerenciáveis pelo master).
 * Cai pro static PLANOS se o banco estiver indisponível.
 */
import { db, ensureSchema } from "./db";
import { PLANOS as STATIC_PLANOS, type Plano } from "./planos";

export type { Plano };

interface Row {
  id: string; nome: string; preco: string; telas_label: string;
  destaque: boolean; recursos: string[] | string; ativo: boolean; ordem: number;
}

function rowToPlano(r: Row): Plano {
  return {
    id: r.id,
    nome: r.nome,
    preco: Number(r.preco),
    telas: r.telas_label,
    destaque: r.destaque,
    recursos: Array.isArray(r.recursos) ? r.recursos : JSON.parse(r.recursos || "[]"),
  };
}

/** Planos ativos pra exibição pública (landing/cadastro). */
export async function listarPlanosAtivos(): Promise<Plano[]> {
  try {
    await ensureSchema();
    const { rows } = await db().query<Row>(
      `SELECT id, nome, preco, telas_label, destaque, recursos, ativo, ordem
         FROM midia_planos WHERE ativo = true ORDER BY ordem, preco DESC`
    );
    return rows.length ? rows.map(rowToPlano) : STATIC_PLANOS;
  } catch {
    return STATIC_PLANOS;
  }
}

/** Todos os planos (admin), incluindo inativos. */
export async function listarTodosPlanos(): Promise<(Plano & { ativo: boolean; ordem: number })[]> {
  await ensureSchema();
  const { rows } = await db().query<Row>(
    `SELECT id, nome, preco, telas_label, destaque, recursos, ativo, ordem
       FROM midia_planos ORDER BY ordem, preco DESC`
  );
  return rows.map(r => ({ ...rowToPlano(r), ativo: r.ativo, ordem: r.ordem }));
}

/** Busca um plano por id (ativo ou não). */
export async function obterPlano(id: string): Promise<Plano | null> {
  await ensureSchema();
  const { rows } = await db().query<Row>(
    `SELECT id, nome, preco, telas_label, destaque, recursos, ativo, ordem FROM midia_planos WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToPlano(rows[0]) : null;
}
