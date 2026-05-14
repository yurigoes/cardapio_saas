/**
 * GET /api/painel/modulos
 *
 * Retorna o estado dos módulos da empresa logada:
 *   - inclusos no plano
 *   - em trial (com data de expiração)
 *   - comprados à la carte (com data de expiração)
 *   - disponíveis pra trial (nunca usaram trial)
 *   - disponíveis pra compra (não tem ativa)
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";
import { MODULOS } from "@/lib/modules/catalog";

interface EmpresaRow { modulos_ativos: string[] | null }
interface TrialRow { modulo: string; expira_em: string }
interface CompraRow { modulo: string; ativa_ate: string | null; status: string }

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden("Master deve impersonar uma empresa");

  try {
    const empresa = await queryOne<EmpresaRow>(
      `SELECT modulos_ativos FROM empresas WHERE id = $1`,
      [empresaId]
    );
    const trials = await query<TrialRow>(
      `SELECT modulo, expira_em FROM modulo_trials
        WHERE empresa_id = $1 AND expira_em > NOW()`,
      [empresaId]
    ).catch(() => []);
    const compras = await query<CompraRow>(
      `SELECT modulo, ativa_ate, status FROM modulo_compras
        WHERE empresa_id = $1
          AND status = 'pago'
          AND (ativa_ate IS NULL OR ativa_ate > NOW())`,
      [empresaId]
    ).catch(() => []);
    const trialsUsadosTodos = await query<{ modulo: string }>(
      `SELECT modulo FROM modulo_trials WHERE empresa_id = $1`,
      [empresaId]
    ).catch(() => []);

    const inclusos    = new Set(empresa?.modulos_ativos ?? []);
    const trialsAtivos = new Map(trials.map(t => [t.modulo, t.expira_em]));
    const compradosAtivos = new Map(compras.map(c => [c.modulo, c.ativa_ate]));
    const jaUsouTrial = new Set(trialsUsadosTodos.map(t => t.modulo));

    const lista = MODULOS.map(m => {
      const incluso     = inclusos.has(m.key);
      const trialAtivo  = trialsAtivos.get(m.key);
      const compraAtiva = compradosAtivos.get(m.key);
      const ativo       = incluso || !!trialAtivo || !!compraAtiva;
      return {
        ...m,
        ativo,
        incluso,
        trial_ativo:    trialAtivo ?? null,
        comprado_ate:   compraAtiva ?? null,
        pode_testar:    !ativo && !jaUsouTrial.has(m.key),
        pode_comprar:   !ativo,
      };
    });

    return ok({ modulos: lista });
  } catch (err) {
    console.error("[Painel/Modulos]", err);
    return serverError();
  }
}
