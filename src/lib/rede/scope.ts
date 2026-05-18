/**
 * Helpers pra trabalhar com REDES de filiais.
 *
 * Conceito:
 *  - "filial" = uma entrada na tabela empresas
 *  - "rede"   = grupo de filiais (tabela redes)
 *  - Empresa pode existir SEM rede (empresa standalone, modo legado)
 *  - Empresa COM rede_id participa do compartilhamento de cardápio etc.
 *
 * Uso típico em endpoint:
 *   const scope = await scopeAtual(empresaId);
 *   if (scope.rede_id) {
 *     // query por rede_id quando aplicável (cardapio, cliente cross-filial)
 *   }
 */
import { queryOne, query } from "@/lib/db/client";

export interface ScopeAtual {
  empresa_id:               string;
  empresa_nome:             string;
  rede_id:                  string | null;
  rede_nome:                string | null;
  is_matriz:                boolean;
  cardapio_sincronizado:    boolean;
  fidelidade_cross_filial:  boolean;
}

export async function scopeAtual(empresaId: string): Promise<ScopeAtual | null> {
  const r = await queryOne<{
    id: string; nome_fantasia: string; rede_id: string | null; is_matriz: boolean;
    rede_nome: string | null;
    cardapio_sincronizado: boolean | null;
    fidelidade_cross_filial: boolean | null;
  }>(
    `SELECT e.id, e.nome_fantasia,
            e.rede_id, COALESCE(e.is_matriz, FALSE) AS is_matriz,
            r.nome AS rede_nome,
            COALESCE(r.cardapio_sincronizado, FALSE)   AS cardapio_sincronizado,
            COALESCE(r.fidelidade_cross_filial, FALSE) AS fidelidade_cross_filial
       FROM empresas e
       LEFT JOIN redes r ON r.id = e.rede_id AND r.deleted_at IS NULL
      WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [empresaId]
  ).catch(() => null);
  if (!r) return null;
  return {
    empresa_id:              r.id,
    empresa_nome:            r.nome_fantasia,
    rede_id:                 r.rede_id,
    rede_nome:               r.rede_nome,
    is_matriz:               r.is_matriz,
    cardapio_sincronizado:   !!r.cardapio_sincronizado,
    fidelidade_cross_filial: !!r.fidelidade_cross_filial,
  };
}

/** Lista filiais de uma rede (ordenadas por ordem_filial, matriz primeiro) */
export async function listarFiliais(redeId: string) {
  return query<{
    id: string; nome_fantasia: string; nome_filial: string | null;
    is_matriz: boolean; ordem_filial: number; status: string;
  }>(
    `SELECT id, nome_fantasia, nome_filial,
            COALESCE(is_matriz, FALSE)    AS is_matriz,
            COALESCE(ordem_filial, 0)     AS ordem_filial,
            status
       FROM empresas
      WHERE rede_id = $1 AND deleted_at IS NULL
      ORDER BY is_matriz DESC, ordem_filial ASC, nome_fantasia ASC`,
    [redeId]
  );
}

/**
 * Verifica se usuário pode operar uma filial específica.
 * Regras:
 *  - master/suporte: sim (cross-tenant)
 *  - usuário com rede_id == rede.id E opera_todas_filiais=true: sim
 *  - usuário cuja empresa_id atual == filial: sim
 */
export async function podeOperarFilial(
  usuarioId: string,
  role: string,
  empresaIdAtual: string,
  filialIdAlvo: string,
): Promise<boolean> {
  if (role === "master" || role === "suporte") return true;
  if (empresaIdAtual === filialIdAlvo) return true;

  const usr = await queryOne<{ rede_id: string | null; opera_todas_filiais: boolean | null }>(
    `SELECT rede_id, COALESCE(opera_todas_filiais, FALSE) AS opera_todas_filiais
       FROM usuarios WHERE id = $1`,
    [usuarioId]
  ).catch(() => null);
  if (!usr?.rede_id || !usr.opera_todas_filiais) return false;

  // Filial alvo deve pertencer à mesma rede
  const filial = await queryOne<{ rede_id: string | null }>(
    `SELECT rede_id FROM empresas WHERE id = $1`,
    [filialIdAlvo]
  ).catch(() => null);
  return filial?.rede_id === usr.rede_id;
}
