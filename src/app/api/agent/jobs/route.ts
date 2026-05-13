/**
 * GET  /api/agent/jobs        → lista jobs pendentes do agente
 * POST /api/agent/jobs/:id/ack → marca job como sucesso ou erro
 *
 * Auth: header Authorization: Bearer pak_xxxxxx
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query, queryOne } from "@/lib/db/client";

interface AgentCtx { id: string; empresaId: string; nome: string }

async function autenticarAgent(req: NextRequest): Promise<AgentCtx | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const key = auth.slice(7).trim();
  if (!key.startsWith("pak_")) return null;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const ip   = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const versao = req.headers.get("x-agent-version") ?? null;

  const row = await queryOne<{ id: string; empresa_id: string; nome: string }>(
    `UPDATE print_agents
        SET ultimo_ping = NOW(),
            ultimo_ip   = $2::inet,
            versao      = COALESCE($3, versao)
      WHERE agent_key_hash = $1 AND ativo = true
      RETURNING id, empresa_id, nome`,
    [hash, ip ?? null, versao]
  ).catch(() => null);

  if (!row) return null;
  return { id: row.id, empresaId: row.empresa_id, nome: row.nome };
}

export async function GET(req: NextRequest) {
  const ctx = await autenticarAgent(req);
  if (!ctx) return NextResponse.json({ ok: false, error: "agent_key inválido" }, { status: 401 });

  try {
    // Marca em 'processando' atomicamente — evita 2 agentes pegando o mesmo job
    const jobs = await query<{
      id: string; impressora_id: string; tipo: string;
      conteudo: string; formato: string; pedido_id: string | null;
      ip: string | null; porta: number; largura_cols: number;
      impressora_nome: string; setor: string;
    }>(
      `WITH locked AS (
         SELECT j.id
           FROM print_jobs j
           JOIN impressoras i ON i.id = j.impressora_id
          WHERE j.empresa_id = $1
            AND j.status = 'pendente'
            AND j.expira_em > NOW()
            AND i.ativa = true
          ORDER BY j.created_at ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED
       )
       UPDATE print_jobs SET status = 'processando', tentativas = tentativas + 1
        WHERE id IN (SELECT id FROM locked)
        RETURNING id, impressora_id, tipo, conteudo, formato, pedido_id`,
      [ctx.empresaId]
    );

    if (jobs.length === 0) return NextResponse.json({ ok: true, jobs: [] });

    // Carrega config das impressoras
    const ids = jobs.map(j => j.impressora_id);
    const imps = await query<{
      id: string; nome: string; setor: string; tipo: string;
      ip: string | null; porta: number; largura_cols: number;
    }>(
      `SELECT id, nome, setor, tipo, ip, porta, largura_cols
         FROM impressoras WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    const impsMap = new Map(imps.map(i => [i.id, i]));

    const enriched = jobs.map(j => {
      const i = impsMap.get(j.impressora_id);
      return {
        id:           j.id,
        tipo:         j.tipo,
        conteudo:     j.conteudo,
        formato:      j.formato,
        pedido_id:    j.pedido_id,
        impressora: {
          id:           i?.id,
          nome:         i?.nome ?? "?",
          setor:        i?.setor ?? "?",
          tipo:         i?.tipo ?? "tcp",
          ip:           i?.ip,
          porta:        i?.porta ?? 9100,
          largura_cols: i?.largura_cols ?? 48,
        },
      };
    });

    return NextResponse.json({ ok: true, jobs: enriched, agent: { nome: ctx.nome } });
  } catch (err) {
    console.error("[Agent/Jobs/GET]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
