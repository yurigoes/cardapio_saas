import { queryOne } from "@/lib/db/client";
import { redis } from "@/lib/db/redis";
import { ModuloId, MODULOS_REGISTRY } from "./registry";
import { ModuleDisabledError } from "@/lib/utils/errors";

/**
 * Durante trial a empresa tem acesso a TODOS os módulos do registry
 * (para experimentar o produto inteiro). Após conversão em 'ativo',
 * passa a valer apenas o que o plano pago liberou em modulos_ativos.
 */
const TODOS_MODULOS_TRIAL: ModuloId[] = Object.keys(MODULOS_REGISTRY) as ModuloId[];

const CACHE_TTL = 300; // 5 minutos

interface EmpresaModulos {
  modulos_ativos: ModuloId[];
  status:         string;
  trial_fim:      string | null;
}

async function getModulosAtivos(empresaId: string): Promise<ModuloId[]> {
  const cacheKey = `empresa:${empresaId}:modulos`;

  // Cache é otimização — falha de Redis não pode quebrar o app inteiro
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ModuloId[];
    }
  } catch (err) {
    console.warn("[ModuleChecker] Redis indisponível, indo direto ao DB:", (err as Error).message);
  }

  const empresa = await queryOne<EmpresaModulos>(
    `SELECT modulos_ativos, status, trial_fim FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
    [empresaId]
  );

  if (!empresa) return [];

  // 'ativo' = assinante pagante → libera tudo
  // 'teste' = trial → libera SE ainda não expirou
  // 'suspensa'/'cancelada' = bloqueia tudo
  const trialAtivo = empresa.status === "teste"
    && !!empresa.trial_fim
    && new Date(empresa.trial_fim).getTime() > Date.now();

  if (empresa.status !== "ativo" && !trialAtivo) {
    return [];
  }

  // Trial = acesso completo; assinante pagante = o que está em modulos_ativos
  const modulos = trialAtivo ? TODOS_MODULOS_TRIAL : (empresa.modulos_ativos ?? []);

  // Best-effort: cacheia mas não quebra se Redis falhar
  try {
    await redis.set(cacheKey, JSON.stringify(modulos), "EX", CACHE_TTL);
  } catch { /* ignora */ }

  return modulos;
}

export async function moduloAtivo(empresaId: string, modulo: ModuloId): Promise<boolean> {
  const modulos = await getModulosAtivos(empresaId);
  return modulos.includes(modulo);
}

export async function assertModuloAtivo(empresaId: string, modulo: ModuloId): Promise<void> {
  const ativo = await moduloAtivo(empresaId, modulo);
  if (!ativo) {
    throw new ModuleDisabledError(modulo);
  }
}

export async function invalidarCacheModulos(empresaId: string): Promise<void> {
  await redis.del(`empresa:${empresaId}:modulos`);
}

export async function ativarModulo(empresaId: string, modulo: ModuloId): Promise<void> {
  await queryOne(
    `UPDATE empresas
     SET modulos_ativos = (
       SELECT jsonb_agg(DISTINCT elem)
       FROM (
         SELECT jsonb_array_elements(modulos_ativos) elem
         UNION
         SELECT $2::jsonb
       ) t
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [empresaId, JSON.stringify(modulo)]
  );

  await invalidarCacheModulos(empresaId);
}

export async function desativarModulo(empresaId: string, modulo: ModuloId): Promise<void> {
  await queryOne(
    `UPDATE empresas
     SET modulos_ativos = (
       SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
       FROM jsonb_array_elements(modulos_ativos) elem
       WHERE elem != $2::jsonb
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [empresaId, JSON.stringify(modulo)]
  );

  await invalidarCacheModulos(empresaId);
}

export async function sincronizarModulosDoPlano(empresaId: string): Promise<void> {
  await queryOne(
    `UPDATE empresas e
     SET modulos_ativos = p.modulos,
         updated_at = NOW()
     FROM planos p
     WHERE e.id = $1 AND e.plano_id = p.id`,
    [empresaId]
  );

  await invalidarCacheModulos(empresaId);
}
