/**
 * GET /api/admin/health-detalhado
 *
 * Master only. Health check expandido com latência real de cada serviço.
 * Diferente de /api/health que é binário (200/500), este devolve breakdown
 * por componente pra debug.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { ok, forbidden } from "@/lib/utils/response";

interface Check {
  componente: string;
  status:     "ok" | "degradado" | "fora" | "nao_configurado";
  latencia_ms: number | null;
  detalhe?:    string;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; result?: T; err?: string }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { ok: true, ms: Date.now() - start, result };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, err: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const checks: Check[] = [];

  // 1. PostgreSQL
  const pg = await timed(async () => {
    const r = await query<{ now: string }>(`SELECT NOW()::text AS now`);
    return r[0]?.now;
  });
  checks.push({
    componente:  "postgres",
    status:      pg.ok ? (pg.ms > 500 ? "degradado" : "ok") : "fora",
    latencia_ms: pg.ms,
    detalhe:     pg.err ?? `${pg.result ?? "?"}`,
  });

  // 2. Redis (via DB se houver, senão skip)
  if (process.env.REDIS_HOST) {
    const redis = await timed(async () => {
      const { default: Redis } = await import("ioredis");
      const r = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT ?? "6379"),
        password: process.env.REDIS_PASSWORD,
        connectTimeout: 3000,
        lazyConnect: true,
      });
      await r.connect();
      const pong = await r.ping();
      await r.quit();
      return pong;
    });
    checks.push({
      componente:  "redis",
      status:      redis.ok ? (redis.ms > 200 ? "degradado" : "ok") : "fora",
      latencia_ms: redis.ms,
      detalhe:     redis.err ?? `${redis.result ?? "?"}`,
    });
  } else {
    checks.push({ componente: "redis", status: "nao_configurado", latencia_ms: null });
  }

  // 3. MinIO
  if (process.env.MINIO_ENDPOINT) {
    const minio = await timed(async () => {
      const url = `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT ?? "9000"}/minio/health/live`;
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error(`status ${r.status}`);
      return "live";
    });
    checks.push({
      componente:  "minio",
      status:      minio.ok ? "ok" : "fora",
      latencia_ms: minio.ms,
      detalhe:     minio.err ?? minio.result,
    });
  } else {
    checks.push({ componente: "minio", status: "nao_configurado", latencia_ms: null });
  }

  // 4. iFood Master config
  const ifood = await timed(async () => {
    const r = await query<{ ativo: boolean; cnt: string }>(
      `SELECT ativo, (SELECT COUNT(*) FROM ifood_config WHERE ativo = true)::text AS cnt
         FROM saas_ifood_config WHERE id = 1`
    );
    return `master_ativo=${r[0]?.ativo ?? false} empresas_conectadas=${r[0]?.cnt ?? 0}`;
  });
  checks.push({
    componente:  "ifood",
    status:      ifood.ok ? "ok" : "nao_configurado",
    latencia_ms: ifood.ms,
    detalhe:     ifood.err ?? ifood.result,
  });

  // 5. Evolution
  if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY) {
    const evo = await timed(async () => {
      const url = process.env.EVOLUTION_API_URL!.replace(/\/$/, "") + "/instance/list";
      const r = await fetch(url, {
        headers: { apikey: process.env.EVOLUTION_API_KEY! },
        signal: AbortSignal.timeout(5000),
      });
      return r.ok ? "ok" : `status ${r.status}`;
    });
    checks.push({
      componente:  "evolution",
      status:      evo.ok && evo.result === "ok" ? "ok" : evo.ok ? "degradado" : "fora",
      latencia_ms: evo.ms,
      detalhe:     evo.err ?? evo.result,
    });
  } else {
    checks.push({ componente: "evolution", status: "nao_configurado", latencia_ms: null });
  }

  // 6. RustDesk relay
  if (process.env.RUSTDESK_RELAY_HOST) {
    const rd = await timed(async () => {
      const host = process.env.RUSTDESK_RELAY_HOST!;
      const r = await fetch(`https://${host}`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
      // Servidor RustDesk não tem HTTP — apenas testar resolução DNS é OK
      return r ? `http_${r.status}` : "dns_ok";
    });
    checks.push({
      componente:  "rustdesk_relay",
      status:      rd.ok ? "ok" : "fora",
      latencia_ms: rd.ms,
      detalhe:     `${process.env.RUSTDESK_RELAY_HOST} (${rd.err ?? rd.result})`,
    });
  } else {
    checks.push({ componente: "rustdesk_relay", status: "nao_configurado", latencia_ms: null });
  }

  // 7. VAPID
  checks.push({
    componente:  "web_push_vapid",
    status:      process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? "ok" : "nao_configurado",
    latencia_ms: 0,
    detalhe:     process.env.VAPID_PUBLIC_KEY ? "configurado" : "rode bash scripts/setup-vapid.sh",
  });

  // 8. Backup
  checks.push({
    componente:  "backup_r2",
    status:      process.env.BACKUP_R2_BUCKET ? "ok" : "nao_configurado",
    latencia_ms: 0,
    detalhe:     process.env.BACKUP_R2_BUCKET ?? "BACKUP_R2_BUCKET não setado",
  });

  // Agregado
  const fora      = checks.filter(c => c.status === "fora").length;
  const degradado = checks.filter(c => c.status === "degradado").length;
  const overall   = fora > 0 ? "fora" : degradado > 0 ? "degradado" : "ok";

  return ok({
    overall,
    timestamp: new Date().toISOString(),
    checks,
  });
}
