/**
 * Helper pra fidelidade compartilhada entre filiais de uma rede.
 *
 * Quando rede.fidelidade_cross_filial=TRUE, clientes acumulam pontos
 * em qualquer filial. Implementação:
 *  - cliente.rede_id é preenchido (canônico, em vez de empresa_id)
 *  - Buscas (telefone/cpf) usam rede_id quando aplicável
 *  - UPDATE pontos afeta o único registro da rede
 */
import { queryOne } from "@/lib/db/client";

export interface ClientesScope {
  empresa_id:    string;
  rede_id:       string | null;
  matriz_id:     string | null;
  /** TRUE se deve filtrar por rede_id */
  cross_filial:  boolean;
}

export async function clientesScope(empresaId: string): Promise<ClientesScope> {
  const row = await queryOne<{
    empresa_id: string;
    rede_id:    string | null;
    cross_filial: boolean | null;
    matriz_id:  string | null;
  }>(
    `SELECT e.id AS empresa_id,
            e.rede_id,
            COALESCE(r.fidelidade_cross_filial, FALSE) AS cross_filial,
            (SELECT m.id FROM empresas m
              WHERE m.rede_id = e.rede_id AND m.is_matriz = TRUE AND m.deleted_at IS NULL
              LIMIT 1) AS matriz_id
       FROM empresas e
       LEFT JOIN redes r ON r.id = e.rede_id AND r.deleted_at IS NULL
      WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [empresaId]
  ).catch(() => null);

  if (!row) {
    return { empresa_id: empresaId, rede_id: null, matriz_id: null, cross_filial: false };
  }
  return {
    empresa_id:   row.empresa_id,
    rede_id:      row.rede_id,
    matriz_id:    row.matriz_id,
    cross_filial: !!row.cross_filial && !!row.rede_id,
  };
}

export function whereClientes(
  scope: ClientesScope,
  alias = "",
  paramIndex = 1,
): { clause: string; value: string; paramIndex: number } {
  const prefix = alias ? `${alias}.` : "";
  if (scope.cross_filial && scope.rede_id) {
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

export function valuesInsertCliente(scope: ClientesScope): {
  empresa_id: string;
  rede_id:    string | null;
} {
  if (scope.cross_filial && scope.rede_id) {
    return {
      empresa_id: scope.matriz_id ?? scope.empresa_id,
      rede_id:    scope.rede_id,
    };
  }
  return { empresa_id: scope.empresa_id, rede_id: null };
}
