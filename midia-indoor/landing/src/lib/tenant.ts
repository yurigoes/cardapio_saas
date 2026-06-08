/**
 * Detecção do tenant a partir do host da requisição.
 * Usado em rotas que precisam isolar dados por operador.
 */
import { NextRequest } from "next/server";
import { db } from "./db";

export interface Tenant {
  id: string;
  slug: string;
  nome: string;
  dominios: string[];
  branding_id: string | null;
  ativo: boolean;
  plano: string;
}

let _cache = new Map<string, Tenant>();
let _cacheAt = 0;

export async function tenantDaRequisicao(req: NextRequest): Promise<Tenant | null> {
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (!host) return tenantDefault();

  // cache 60s
  if (Date.now() - _cacheAt > 60_000) { _cache.clear(); _cacheAt = Date.now(); }
  if (_cache.has(host)) return _cache.get(host)!;

  const r = await db().query<Tenant>(
    `SELECT id, slug, nome, dominios, branding_id, ativo, plano FROM midia_tenants WHERE $1 = ANY(dominios) AND ativo = true LIMIT 1`,
    [host]
  ).catch(() => ({ rows: [] }));
  const t = r.rows[0] ?? await tenantDefault();
  if (t) _cache.set(host, t);
  return t;
}

export async function tenantDefault(): Promise<Tenant | null> {
  const r = await db().query<Tenant>(`SELECT id, slug, nome, dominios, branding_id, ativo, plano FROM midia_tenants WHERE slug='three-digital' LIMIT 1`).catch(() => ({ rows: [] }));
  return r.rows[0] ?? null;
}
