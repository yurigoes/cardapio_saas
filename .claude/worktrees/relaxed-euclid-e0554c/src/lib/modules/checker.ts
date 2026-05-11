import { queryOne } from "@/lib/db/client";
import { redis } from "@/lib/db/redis";
import { ModuloId } from "./registry";
import { ModuleDisabledError } from "@/lib/utils/errors";

const CACHE_TTL = 300; // 5 minutos

interface EmpresaModulos {
  modulos_ativos: ModuloId[];
  status:         string;
}

async function getModulosAtivos(empresaId: string): Promise<ModuloId[]> {
  const cacheKey = `empresa:${empresaId}:modulos`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as ModuloId[];
  }

  const empresa = await queryOne<EmpresaModulos>(
    `SELECT modulos_ativos, status FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
    [empresaId]
  );

  if (!empresa || empresa.status !== "ativo") {
    return [];
  }

  const modulos = empresa.modulos_ativos ?? [];
  await redis.set(cacheKey, JSON.stringify(modulos), "EX", CACHE_TTL);

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
