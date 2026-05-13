/**
 * GET /api/admin/vps/jobs — agente busca jobs pendentes (long-poll)
 *
 * Auth: Bearer vak_xxx (vps_agents.agent_key_hash)
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query, queryOne } from "@/lib/db/client";

async function autenticarAgent(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const key = auth.slice(7).trim();
  if (!key.startsWith("vak_")) return null;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const ip   = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const versao   = req.headers.get("x-agent-version") ?? null;
  const hostname = req.headers.get("x-agent-hostname") ?? null;

  const row = await queryOne<{ id: string; nome: string }>(
    `UPDATE vps_agents
        SET ultimo_ping = NOW(),
            ultimo_ip   = $2::inet,
            versao      = COALESCE($3, versao),
            hostname    = COALESCE($4, hostname)
      WHERE agent_key_hash = $1 AND ativo = true
      RETURNING id, nome`,
    [hash, ip ?? null, versao, hostname]
  ).catch(() => null);

  return row;
}

export async function GET(req: NextRequest) {
  const agent = await autenticarAgent(req);
  if (!agent) return NextResponse.json({ ok: false, error: "agent_key inválida" }, { status: 401 });

  try {
    // Pega até 5 jobs pendentes e marca como 'processando' atomicamente
    const jobs = await query<{ id: string; comando: string; params: Record<string, unknown> }>(
      `WITH locked AS (
         SELECT id FROM vps_jobs
          WHERE status = 'pendente' AND expira_em > NOW()
          ORDER BY created_at ASC
          LIMIT 5
          FOR UPDATE SKIP LOCKED
       )
       UPDATE vps_jobs SET status = 'processando', enviado_em = NOW()
        WHERE id IN (SELECT id FROM locked)
        RETURNING id, comando, params`
    );

    return NextResponse.json({ ok: true, jobs, agent: { nome: agent.nome } });
  } catch (err) {
    console.error("[VPS/Jobs/GET]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
