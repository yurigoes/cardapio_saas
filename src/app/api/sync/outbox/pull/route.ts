/**
 * GET /api/sync/outbox/pull?since=<iso>&limit=100
 *
 * Auth: Bearer rdt_<token>
 *
 * Retaguarda puxa eventos da VPS que precisam ser aplicados localmente.
 * Filtra por empresa_id do agente e timestamp 'since'.
 */
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { extractAgentToken, sha256 } from "@/lib/agentes/token";

export async function GET(req: NextRequest) {
  const token = extractAgentToken(req);
  if (!token) return NextResponse.json({ ok: false, error: "missing token" }, { status: 401 });

  const tokenHash = sha256(token);
  const agente = await queryOne<{ id: string; empresa_id: string }>(
    `SELECT id, empresa_id FROM agentes
      WHERE token_hash = $1 AND ativo = true AND deleted_at IS NULL`,
    [tokenHash]
  ).catch(() => null);
  if (!agente) return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });

  const url = new URL(req.url);
  const since = url.searchParams.get("since") ?? new Date(Date.now() - 24 * 3600_000).toISOString();
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);

  const eventos = await query(
    `SELECT id, tipo, entidade_id, payload, criado_em::text
       FROM sync_outbox
      WHERE empresa_id = $1
        AND criado_em > $2::timestamptz
      ORDER BY criado_em ASC
      LIMIT $3`,
    [agente.empresa_id, since, limit]
  ).catch(() => []);

  return NextResponse.json({
    ok: true,
    eventos,
    proximo_since: eventos.length > 0
      ? (eventos[eventos.length - 1] as { criado_em: string }).criado_em
      : since,
  });
}
