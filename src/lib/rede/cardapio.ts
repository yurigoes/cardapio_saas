/**
 * Helpers pra cardápio compartilhado em redes de filiais.
 *
 * Conceito:
 *  - Empresa STANDALONE (sem rede): produtos/categorias filtram por empresa_id
 *  - Empresa em REDE com cardapio_sincronizado=true: produtos/categorias
 *    compartilhados — filtram por rede_id (visíveis em todas filiais)
 *  - Empresa em REDE com cardapio_sincronizado=false (modo legado):
 *    cada filial tem cardápio próprio — filtra por empresa_id
 *
 * Implementação:
 *  - Todo produto/categoria tem empresa_id (NOT NULL) + rede_id (nullable)
 *  - Quando empresa em rede sincronizada cria produto: empresa_id=matriz_id,
 *    rede_id=rede.id
 *  - Queries usam rede_id quando aplicável, com empresa_id como fallback
 */
import { queryOne } from "@/lib/db/client";

export interface CardapioScope {
  /** Empresa do JWT */
  empresa_id:       string;
  /** Se empresa tem rede E cardápio sincronizado, este vem preenchido */
  rede_id:          string | null;
  /** ID da matriz da rede (usado como empresa_id "canônico" pra INSERTs compartilhados) */
  matriz_id:        string | null;
  /** Se TRUE, queries devem filtrar por rede_id; se FALSE, por empresa_id */
  sincronizado:     boolean;
}

/**
 * Determina como filtrar/inserir produtos+categorias pra uma empresa.
 */
export async function cardapioScope(empresaId: string): Promise<CardapioScope> {
  const row = await queryOne<{
    empresa_id: string;
    rede_id:    string | null;
    sincronizado: boolean | null;
    matriz_id:  string | null;
  }>(
    `SELECT e.id AS empresa_id,
            e.rede_id,
            COALESCE(r.cardapio_sincronizado, FALSE) AS sincronizado,
            (SELECT m.id FROM empresas m
              WHERE m.rede_id = e.rede_id AND m.is_matriz = TRUE AND m.deleted_at IS NULL
              LIMIT 1) AS matriz_id
       FROM empresas e
       LEFT JOIN redes r ON r.id = e.rede_id AND r.deleted_at IS NULL
      WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [empresaId]
  ).catch(() => null);

  if (!row) {
    return { empresa_id: empresaId, rede_id: null, matriz_id: null, sincronizado: false };
  }
  return {
    empresa_id:   row.empresa_id,
    rede_id:      row.rede_id,
    matriz_id:    row.matriz_id,
    sincronizado: !!row.sincronizado && !!row.rede_id,
  };
}

/**
 * Constrói a cláusula WHERE pra filtrar produtos/categorias.
 */
export function buildWhereCardapio(
  scope: CardapioScope,
  tabelaAlias = "",
  paramIndex = 1,
): { clause: string; value: string; paramIndex: number } {
  const prefix = tabelaAlias ? `${tabelaAlias}.` : "";
  if (scope.sincronizado && scope.rede_id) {
    return {
      clause:     `${prefix}rede_id = $${paramIndex}`,
      value:      scope.rede_id,
      paramIndex: paramIndex + 1,
    };
  }
  return {
    clause:     `${prefix}empresa_id = $${paramIndex}`,
    value:      scope.empresa_id,
    paramIndex: paramIndex + 1,
  };
}

/**
 * Versão que considera exclusivo_filial_id (apenas pra PRODUTOS).
 * Retorna produtos da rede que NÃO são exclusivos de outra filial OU
 * que são exclusivos DESTA filial.
 * Use no endpoint PÚBLICO de cardápio (totem/site) — admins veem tudo.
 */
export function buildWhereCardapioComExclusivo(
  scope: CardapioScope,
  tabelaAlias = "",
  paramIndex = 1,
): { clause: string; values: string[]; paramIndex: number } {
  const prefix = tabelaAlias ? `${tabelaAlias}.` : "";
  if (scope.sincronizado && scope.rede_id) {
    return {
      clause: `${prefix}rede_id = $${paramIndex} AND (${prefix}exclusivo_filial_id IS NULL OR ${prefix}exclusivo_filial_id = $${paramIndex + 1})`,
      values: [scope.rede_id, scope.empresa_id],
      paramIndex: paramIndex + 2,
    };
  }
  return {
    clause: `${prefix}empresa_id = $${paramIndex}`,
    values: [scope.empresa_id],
    paramIndex: paramIndex + 1,
  };
}

/**
 * Retorna os valores pra INSERT/UPDATE: empresa_id (matriz ou atual) + rede_id.
 */
export function valuesInsertCardapio(scope: CardapioScope): {
  empresa_id: string;
  rede_id:    string | null;
} {
  if (scope.sincronizado && scope.rede_id) {
    return {
      empresa_id: scope.matriz_id ?? scope.empresa_id,  // canônico = matriz
      rede_id:    scope.rede_id,
    };
  }
  return { empresa_id: scope.empresa_id, rede_id: null };
}
