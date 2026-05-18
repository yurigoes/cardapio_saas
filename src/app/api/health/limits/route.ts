/**
 * GET /api/health/limits
 *
 * Monitor de saturação. Retorna métricas de uso vs limites configurados.
 * Disponível sem auth (proxy via nginx/CF deve bloquear ou aceitar como ok).
 *
 * Campos retornados:
 *  - pool_db:        conexões ativas vs DB_POOL_MAX
 *  - mem_node:       RSS atual do processo Node (rough)
 *  - cache_pg:       % cache hit do Postgres
 *  - redis_ok:       boolean
 *  - alerta_nivel:   ok | atencao | critico
 *
 * Usado por monitoramento externo (uptime-kuma, n8n alerta WhatsApp etc).
 */
import { NextResponse } from "next/server";
import { query, queryOne, pool } from "@/lib/db/client";
import { healthCheck as redisOk } from "@/lib/db/redis";

export const dynamic   = "force-dynamic";
export const runtime   = "nodejs";

interface LimitReport {
  ok: boolean;
  ts: string;
  pool_db: {
    total_max:    number;
    em_uso:       number;
    idle:         number;
    waiting:      number;
    pct_uso:      number;
  };
  postgres: {
    total_conexoes: number;
    active:         number;
    idle:           number;
    cache_hit_pct:  number;
    db_size_mb:     number;
  };
  node: {
    rss_mb:         number;
    heap_used_mb:   number;
    heap_total_mb:  number;
    uptime_s:       number;
  };
  redis: { ok: boolean };
  alerta_nivel: "ok" | "atencao" | "critico";
  alertas: string[];
}

export async function GET() {
  const alertas: string[] = [];
  const max = Number(process.env.DB_POOL_MAX ?? 20);

  // Pool stats do node-pg (instancia exportada)
  const poolStats = {
    total:    pool.totalCount,
    idle:     pool.idleCount,
    waiting:  pool.waitingCount,
  };
  const emUso  = poolStats.total - poolStats.idle;
  const pctUso = max > 0 ? Math.round((emUso / max) * 100) : 0;

  if (pctUso >= 90)      alertas.push(`Pool DB em ${pctUso}% (em uso: ${emUso}/${max})`);
  else if (pctUso >= 75) alertas.push(`Pool DB alto: ${pctUso}%`);

  // Postgres aggregate
  const pgConn = await query<{ count: string; state: string | null }>(
    `SELECT count(*)::text AS count, state FROM pg_stat_activity GROUP BY state`
  ).catch(() => [] as { count: string; state: string | null }[]);
  const active = Number(pgConn.find(r => r.state === "active")?.count ?? 0);
  const idle   = Number(pgConn.find(r => r.state === "idle")?.count ?? 0);
  const total  = pgConn.reduce((a, r) => a + Number(r.count), 0);

  const cacheRow = await queryOne<{ cache_hit_pct: string | null }>(
    `SELECT round(sum(blks_hit)*100.0/nullif(sum(blks_hit+blks_read),0), 2)::text AS cache_hit_pct
       FROM pg_stat_database`
  ).catch(() => null);
  const cacheHit = Number(cacheRow?.cache_hit_pct ?? 0);
  if (cacheHit > 0 && cacheHit < 95) {
    alertas.push(`Cache PG baixo: ${cacheHit}% (esperado >98%)`);
  }

  const sizeRow = await queryOne<{ mb: string }>(
    `SELECT round(pg_database_size(current_database())/1024.0/1024.0, 1)::text AS mb`
  ).catch(() => ({ mb: "0" }));

  // Memória Node
  const mem = process.memoryUsage();
  const rssMb     = Math.round(mem.rss / 1024 / 1024);
  const heapUsed  = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotal = Math.round(mem.heapTotal / 1024 / 1024);

  if (rssMb > 800)      alertas.push(`Node RSS alto: ${rssMb} MB`);

  // Redis
  const redis = await redisOk().catch(() => false);
  if (!redis) alertas.push("Redis OFFLINE — cache desabilitado, requests cairão direto no PG");

  // Nível agregado
  let nivel: LimitReport["alerta_nivel"] = "ok";
  if (alertas.some(a => a.includes("90%") || a.includes("OFFLINE"))) nivel = "critico";
  else if (alertas.length > 0)                                         nivel = "atencao";

  const report: LimitReport = {
    ok: nivel !== "critico",
    ts: new Date().toISOString(),
    pool_db: {
      total_max:  max,
      em_uso:     emUso,
      idle:       poolStats.idle,
      waiting:    poolStats.waiting,
      pct_uso:    pctUso,
    },
    postgres: {
      total_conexoes: total,
      active,
      idle,
      cache_hit_pct: cacheHit,
      db_size_mb:    Number(sizeRow?.mb ?? 0),
    },
    node: {
      rss_mb:        rssMb,
      heap_used_mb:  heapUsed,
      heap_total_mb: heapTotal,
      uptime_s:      Math.round(process.uptime()),
    },
    redis:        { ok: redis },
    alerta_nivel: nivel,
    alertas,
  };

  // Log estruturado: monitoramento externo pode parsear
  if (nivel !== "ok") {
    console.warn(`[health/limits] ${nivel.toUpperCase()} ${alertas.join(" · ")}`);
  }

  return NextResponse.json(report, {
    status:  nivel === "critico" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
