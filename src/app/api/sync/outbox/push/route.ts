/**
 * POST /api/sync/outbox/push
 *
 * Auth: Bearer rdt_<token> (token de agente da retaguarda local)
 * Body: { eventos: [{ tipo, entidade_id?, payload, criado_em }, ...] }
 *
 * Retaguarda local empurra eventos pendentes pra VPS. VPS responde com
 * IDs ack-ados pra retaguarda marcar como enviado.
 *
 * Este endpoint é stub: aceita e armazena eventos pra processamento
 * posterior por worker. Aplicação real (criar pedido, etc) vem depois.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db/client";
import { extractAgentToken, sha256 } from "@/lib/agentes/token";

const eventoSchema = z.object({
  tipo:        z.string().min(1).max(50),
  entidade_id: z.string().uuid().optional(),
  payload:     z.record(z.unknown()),
  criado_em:   z.string().optional(),
});

const schema = z.object({
  eventos: z.array(eventoSchema).min(1).max(100),
});

export async function POST(req: NextRequest) {
  const token = extractAgentToken(req);
  if (!token) return NextResponse.json({ ok: false, error: "missing token" }, { status: 401 });

  const tokenHash = sha256(token);
  const agente = await queryOne<{ id: string; empresa_id: string }>(
    `SELECT id, empresa_id FROM agentes
      WHERE token_hash = $1 AND ativo = true AND deleted_at IS NULL`,
    [tokenHash]
  ).catch(() => null);
  if (!agente) return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Body inválido",
    }, { status: 400 });
  }

  const ids: string[] = [];
  for (const ev of body.eventos) {
    const r = await queryOne<{ id: string }>(
      `INSERT INTO sync_inbox (empresa_id, agente_id, tipo, entidade_id, payload, recebido_em)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       RETURNING id`,
      [agente.empresa_id, agente.id, ev.tipo, ev.entidade_id ?? null, JSON.stringify(ev.payload)]
    );
    if (r) ids.push(r.id);
  }

  return NextResponse.json({
    ok: true,
    ack: ids,
    next_pull_in_sec: 60,
  });
}
