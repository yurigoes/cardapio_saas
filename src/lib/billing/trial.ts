/**
 * Trial — helpers para o ciclo de 14 dias.
 *
 * Regras:
 *   - status='teste' + trial_fim no futuro = trial ativo
 *   - status='teste' + trial_fim no passado = expirado (cron move para 'suspensa')
 *   - status='ativo' = assinante pagante (trial não importa mais)
 *   - status='suspensa'/'cancelada' = bloqueia tudo exceto módulos free
 */
import { queryOne, query } from "@/lib/db/client";
import { invalidarCacheModulos } from "@/lib/modules/checker";

export const TRIAL_DIAS_PADRAO = 14;

export interface TrialInfo {
  status:        "teste" | "ativo" | "suspensa" | "cancelada";
  trial_inicio:  string | null;
  trial_fim:     string | null;
  ativo:         boolean;          // trial dentro da janela
  expirado:      boolean;          // trial fora da janela
  diasRestantes: number;           // 0 se expirado/sem trial
}

/** Calcula info de trial a partir de campos da empresa */
export function calcularTrial(input: {
  status:       string;
  trial_inicio: string | Date | null;
  trial_fim:    string | Date | null;
}): TrialInfo {
  const status = (input.status as TrialInfo["status"]) ?? "cancelada";
  const fim    = input.trial_fim ? new Date(input.trial_fim) : null;
  const agora  = new Date();

  const ativo    = status === "teste" && !!fim && fim.getTime() > agora.getTime();
  const expirado = status === "teste" && !!fim && fim.getTime() <= agora.getTime();

  let diasRestantes = 0;
  if (ativo && fim) {
    diasRestantes = Math.max(0, Math.ceil((fim.getTime() - agora.getTime()) / 86_400_000));
  }

  return {
    status,
    trial_inicio:  input.trial_inicio ? new Date(input.trial_inicio).toISOString() : null,
    trial_fim:     input.trial_fim    ? new Date(input.trial_fim).toISOString()    : null,
    ativo,
    expirado,
    diasRestantes,
  };
}

/** Lê trial info da empresa (1 query) */
export async function getTrialInfo(empresaId: string): Promise<TrialInfo | null> {
  const row = await queryOne<{
    status: string; trial_inicio: string | null; trial_fim: string | null;
  }>(
    `SELECT status, trial_inicio, trial_fim
       FROM empresas
      WHERE id = $1 AND deleted_at IS NULL`,
    [empresaId]
  );
  if (!row) return null;
  return calcularTrial(row);
}

/** Inicia trial em empresa nova ou em reset manual */
export async function iniciarTrial(empresaId: string, dias = TRIAL_DIAS_PADRAO): Promise<void> {
  await queryOne(
    `UPDATE empresas
        SET trial_inicio = NOW(),
            trial_fim    = NOW() + ($2 || ' days')::interval,
            trial_dias   = $2,
            status       = 'teste',
            updated_at   = NOW()
      WHERE id = $1 AND deleted_at IS NULL`,
    [empresaId, dias]
  );
  await invalidarCacheModulos(empresaId);
}

/** Estende trial em N dias adicionais (a partir de trial_fim atual ou now, o que for maior) */
export async function estenderTrial(empresaId: string, diasExtra: number): Promise<TrialInfo | null> {
  await queryOne(
    `UPDATE empresas
        SET trial_fim  = GREATEST(trial_fim, NOW()) + ($2 || ' days')::interval,
            status     = CASE WHEN status IN ('suspensa','cancelada') THEN 'teste' ELSE status END,
            updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL`,
    [empresaId, diasExtra]
  );
  await invalidarCacheModulos(empresaId);
  return getTrialInfo(empresaId);
}

/**
 * Varredura diária: marca empresas com trial expirado como 'suspensa'.
 * Retorna lista de empresas afetadas para envio de email/notificação.
 */
export async function expirarTriaisVencidos(): Promise<Array<{ id: string; nome_fantasia: string; email: string | null }>> {
  const expiradas = await query<{ id: string; nome_fantasia: string; email: string | null }>(
    `UPDATE empresas
        SET status     = 'suspensa',
            updated_at = NOW()
      WHERE status = 'teste'
        AND trial_fim IS NOT NULL
        AND trial_fim <= NOW()
        AND deleted_at IS NULL
      RETURNING id, nome_fantasia, email`
  );

  // Invalida cache de módulos para todas
  await Promise.all(expiradas.map(e => invalidarCacheModulos(e.id)));

  return expiradas;
}
