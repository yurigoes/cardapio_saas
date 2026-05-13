/**
 * GET  /api/admin/vps/diagnosticos — lista histórico
 * POST /api/admin/vps/diagnosticos — dispara um diagnóstico completo agora
 *
 * Diagnóstico = roda status+disk+docker_ps em sequência via vps-agent,
 * compila resumo, classifica como ok/warn/erro baseado em thresholds.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();
  try {
    const rows = await query(
      `SELECT id, origem, resultado, duracao_ms, resumo,
              detalhes, notificado, created_at
         FROM vps_diagnosticos
        ORDER BY created_at DESC LIMIT 50`
    );
    return ok(rows);
  } catch (err) {
    console.error("[VPS/Diagnosticos/GET]", err);
    return serverError();
  }
}

interface JobResult {
  status: string;
  resultado: unknown;
  erro: string | null;
}

async function execComando(comando: string, params: Record<string, unknown> = {}): Promise<JobResult> {
  const job = await queryOne<{ id: string }>(
    `INSERT INTO vps_jobs (comando, params) VALUES ($1, $2::jsonb) RETURNING id`,
    [comando, JSON.stringify(params)]
  );
  if (!job) return { status: "erro", resultado: null, erro: "falha ao enfileirar" };

  const inicio = Date.now();
  while (Date.now() - inicio < 30_000) {
    await new Promise(r => setTimeout(r, 500));
    const r = await queryOne<JobResult>(
      `SELECT status, resultado, erro FROM vps_jobs WHERE id = $1`,
      [job.id]
    );
    if (r && (r.status === "sucesso" || r.status === "erro")) return r;
  }
  return { status: "timeout", resultado: null, erro: "agente não respondeu em 30s" };
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let origem = "manual";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.origem) origem = String(body.origem).slice(0, 20);
  } catch {}

  try {
    const inicio = Date.now();

    // Roda 3 comandos em paralelo
    const [status, disk, dockerPs] = await Promise.all([
      execComando("status"),
      execComando("disk"),
      execComando("docker_ps"),
    ]);

    // Pega contagem de erros do error_log nas últimas 24h
    const errosRecentes = await queryOne<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM error_log
        WHERE created_at >= NOW() - INTERVAL '24 hours' AND level = 'error'`
    ).catch(() => null);

    // Análise — decide ok/warn/erro
    const avisos: string[] = [];
    const criticos: string[] = [];

    if (status.status !== "sucesso") {
      criticos.push("vps-agent não respondeu");
    } else {
      const s = status.resultado as { memoria?: { uso_pct?: number }; cpu?: { load5?: string } } | null;
      const memPct = s?.memoria?.uso_pct ?? 0;
      const load5  = parseFloat(s?.cpu?.load5 ?? "0");
      if (memPct > 90)        criticos.push(`RAM em ${memPct}%`);
      else if (memPct > 75)   avisos.push(`RAM em ${memPct}%`);
      if (load5 > 4)          criticos.push(`load 5min: ${load5.toFixed(2)}`);
      else if (load5 > 2)     avisos.push(`load 5min: ${load5.toFixed(2)}`);
    }

    if (disk.status === "sucesso") {
      const partitions = (disk.resultado as Array<{ target: string; uso_pct: number }>) ?? [];
      for (const p of partitions) {
        if (p.uso_pct > 90)      criticos.push(`disco ${p.target} em ${p.uso_pct}%`);
        else if (p.uso_pct > 80) avisos.push(`disco ${p.target} em ${p.uso_pct}%`);
      }
    }

    const erros24h = parseInt(errosRecentes?.n ?? "0", 10);
    if (erros24h > 100)     criticos.push(`${erros24h} erros nas últimas 24h`);
    else if (erros24h > 20) avisos.push(`${erros24h} erros nas últimas 24h`);

    const resultado = criticos.length > 0 ? "erro" : avisos.length > 0 ? "warn" : "ok";
    const resumo = criticos.length > 0
      ? "🔴 " + criticos.join("; ")
      : avisos.length > 0
        ? "🟡 " + avisos.join("; ")
        : "🟢 Tudo OK";

    const detalhes = {
      status:    status.resultado,
      disk:      disk.resultado,
      docker_ps: dockerPs.resultado,
      erros_24h: erros24h,
      avisos, criticos,
    };

    const diag = await queryOne<{ id: string }>(
      `INSERT INTO vps_diagnosticos (origem, resultado, duracao_ms, resumo, detalhes)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [origem, resultado, Date.now() - inicio, resumo, JSON.stringify(detalhes)]
    );

    return ok({
      id:       diag?.id,
      resultado, resumo, avisos, criticos,
      duracao_ms: Date.now() - inicio,
      detalhes,
    });
  } catch (err) {
    console.error("[VPS/Diagnosticos/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
