/**
 * Localiza a zona de entrega aplicável a um endereço (CEP ou bairro).
 *
 * Prioridade:
 *   1. Match por CEP range (cep_inicio <= cep <= cep_fim)
 *   2. Match por bairro (case-insensitive, exato)
 *   3. Nada → retorna null (caller usa empresa.taxa_entrega como fallback)
 *
 * Apenas zonas ativas são consideradas.
 */
import { queryOne } from "@/lib/db/client";

export interface ZonaLookupResult {
  id:            string;
  nome:          string;
  valor_cobrado: number;
  valor_motoboy: number;
  tempo_min:     number | null;
}

interface ZonaRow {
  id:            string;
  nome:          string;
  valor_cobrado: string | null;
  taxa:          string | null;
  valor_motoboy: string | null;
  tempo_min:     number | null;
}

export async function lookupZonaParaEndereco(
  empresaId: string,
  endereco: { cep?: string; bairro?: string } | null | undefined
): Promise<ZonaLookupResult | null> {
  if (!endereco) return null;
  const cepDigits = (endereco.cep ?? "").replace(/\D/g, "");
  const bairro    = (endereco.bairro ?? "").trim();
  if (!cepDigits && !bairro) return null;

  // 1) Por CEP range — mais específico
  if (cepDigits.length === 8) {
    const r = await queryOne<ZonaRow>(
      `SELECT id, nome,
              COALESCE(valor_cobrado, taxa, 0) AS valor_cobrado,
              taxa,
              COALESCE(valor_motoboy, 0)       AS valor_motoboy,
              tempo_min
         FROM zonas_entrega
        WHERE empresa_id = $1
          AND ativo = TRUE
          AND cep_inicio IS NOT NULL AND cep_fim IS NOT NULL
          AND $2 BETWEEN cep_inicio AND cep_fim
        ORDER BY (CAST(cep_fim AS BIGINT) - CAST(cep_inicio AS BIGINT)) ASC
        LIMIT 1`,
      [empresaId, cepDigits]
    ).catch(() => null);
    if (r) return mapRow(r);
  }

  // 2) Por bairro — match case-insensitive
  if (bairro) {
    const r = await queryOne<ZonaRow>(
      `SELECT id, nome,
              COALESCE(valor_cobrado, taxa, 0) AS valor_cobrado,
              taxa,
              COALESCE(valor_motoboy, 0)       AS valor_motoboy,
              tempo_min
         FROM zonas_entrega
        WHERE empresa_id = $1
          AND ativo = TRUE
          AND bairro IS NOT NULL
          AND lower(bairro) = lower($2)
        LIMIT 1`,
      [empresaId, bairro]
    ).catch(() => null);
    if (r) return mapRow(r);
  }

  return null;
}

function mapRow(r: ZonaRow): ZonaLookupResult {
  return {
    id:            r.id,
    nome:          r.nome,
    valor_cobrado: Number(r.valor_cobrado ?? r.taxa ?? 0),
    valor_motoboy: Number(r.valor_motoboy ?? 0),
    tempo_min:     r.tempo_min,
  };
}
