/**
 * Helper pra verificar se uma empresa está bloqueada por inadimplência.
 * Centraliza a regra: "qualquer cobrança vencida há mais de 24h, sem pagamento".
 *
 * Bloqueia se:
 *  - mensalidades.status IN ('aberta','atrasada') AND vencimento < NOW() - 24h
 *  - cobrancas_avulsas.status IN ('aberta','atrasada') AND vencimento < NOW() - 24h
 *  - empresa_modulos_extras.bloqueado = TRUE (tipo='alacarte' que venceu)
 *  - OU empresas.bloqueado_inadimplencia = TRUE (set manual ou pelo cron)
 */
import { queryOne } from "@/lib/db/client";

export interface StatusInadimplencia {
  bloqueada:        boolean;
  motivo:           string | null;
  total_vencido:    number;
  cobrancas_qtd:    number;
  cobrancas:        Array<{
    tipo:       "mensalidade" | "avulsa" | "modulo_extra";
    descricao:  string;
    valor:      number;
    vencimento: string;
    dias_atraso: number;
  }>;
}

export async function checarInadimplencia(empresaId: string): Promise<StatusInadimplencia> {
  // Flag manual / cache
  const empresa = await queryOne<{ bloqueado_inadimplencia: boolean; bloqueado_motivo: string | null }>(
    `SELECT COALESCE(bloqueado_inadimplencia, FALSE) AS bloqueado_inadimplencia,
            bloqueado_motivo
       FROM empresas WHERE id = $1`,
    [empresaId]
  );

  // Mensalidades vencidas 24h+
  const mens = await queryOne<{ n: string; total: string; itens: Array<{ valor: string; vencimento: string; dias: number }> }>(
    `SELECT COUNT(*)::text AS n,
            COALESCE(SUM(valor), 0)::text AS total,
            COALESCE(json_agg(json_build_object(
              'valor', valor, 'vencimento', vencimento::text,
              'dias',  GREATEST(0, (CURRENT_DATE - vencimento))
            )), '[]'::json) AS itens
       FROM mensalidades
      WHERE empresa_id = $1
        AND status IN ('aberta','atrasada')
        AND vencimento < CURRENT_DATE - INTERVAL '1 day'`,
    [empresaId]
  ).catch(() => null);

  // Cobranças avulsas vencidas 24h+
  const av = await queryOne<{ n: string; total: string; itens: Array<{ nome: string; valor: string; vencimento: string; dias: number }> }>(
    `SELECT COUNT(*)::text AS n,
            COALESCE(SUM(valor), 0)::text AS total,
            COALESCE(json_agg(json_build_object(
              'nome', nome, 'valor', valor, 'vencimento', vencimento::text,
              'dias', GREATEST(0, (CURRENT_DATE - vencimento))
            )), '[]'::json) AS itens
       FROM cobrancas_avulsas
      WHERE empresa_id = $1
        AND status IN ('aberta','atrasada')
        AND vencimento < CURRENT_DATE - INTERVAL '1 day'`,
    [empresaId]
  ).catch(() => null);

  // Módulos extras bloqueados (alacarte vencidos pelo cron)
  const ex = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM empresa_modulos_extras
      WHERE empresa_id = $1 AND bloqueado = TRUE AND tipo = 'alacarte'`,
    [empresaId]
  ).catch(() => null);

  const qtdMens = Number(mens?.n ?? "0");
  const qtdAv   = Number(av?.n ?? "0");
  const qtdEx   = Number(ex?.n ?? "0");
  const total   = Number(mens?.total ?? "0") + Number(av?.total ?? "0");

  const cobrancas: StatusInadimplencia["cobrancas"] = [];
  for (const m of (mens?.itens ?? [])) {
    cobrancas.push({
      tipo: "mensalidade",
      descricao: "Mensalidade do plano",
      valor: Number(m.valor),
      vencimento: m.vencimento,
      dias_atraso: m.dias,
    });
  }
  for (const a of (av?.itens ?? [])) {
    cobrancas.push({
      tipo: "avulsa",
      descricao: a.nome,
      valor: Number(a.valor),
      vencimento: a.vencimento,
      dias_atraso: a.dias,
    });
  }

  const bloqueada = empresa?.bloqueado_inadimplencia === true
                 || qtdMens > 0 || qtdAv > 0 || qtdEx > 0;

  let motivo: string | null = null;
  if (bloqueada) {
    if (empresa?.bloqueado_motivo) motivo = empresa.bloqueado_motivo;
    else if (qtdMens > 0)          motivo = `${qtdMens} mensalidade(s) vencida(s)`;
    else if (qtdAv > 0)            motivo = `${qtdAv} cobrança(s) avulsa(s) vencida(s)`;
    else                            motivo = `${qtdEx} módulo(s) extra(s) bloqueado(s)`;
  }

  return {
    bloqueada,
    motivo,
    total_vencido: total,
    cobrancas_qtd: qtdMens + qtdAv,
    cobrancas,
  };
}
