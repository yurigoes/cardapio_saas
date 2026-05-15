/**
 * POST /api/sync/heartbeat
 *
 * Auth: Authorization: Bearer rdt_<token>
 * Body: {
 *   hostname?: string,
 *   plataforma?: string,
 *   versao?: string,
 *   fila_pendente?: number,
 *   ultimo_pedido_em?: string (ISO),
 *   metadados?: Record<string, unknown>,
 * }
 *
 * Chamado pelo agente local (retaguarda, terminal, etc) a cada N segundos
 * pra dizer "estou vivo". Atualiza ultimo_hb_em + status='online' + IP.
 *
 * Resposta inclui flag de comandos pendentes (futura: força ação remota).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { extractAgentToken, sha256 } from "@/lib/agentes/token";

const schema = z.object({
  hostname:        z.string().max(200).optional(),
  plataforma:      z.string().max(50).optional(),
  versao:          z.string().max(50).optional(),
  fila_pendente:   z.number().int().min(0).max(99999).optional(),
  ultimo_pedido_em: z.string().datetime().optional(),
  metadados:       z.record(z.unknown()).optional(),
}).strict().partial();

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return null;
}

export async function POST(req: NextRequest) {
  const token = extractAgentToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing token" }, { status: 401 });
  }

  const tokenHash = sha256(token);
  const agente = await queryOne<{
    id: string;
    empresa_id: string;
    status: string;
    primeiro_hb_em: string | null;
  }>(
    `SELECT id, empresa_id, status, primeiro_hb_em
       FROM agentes
      WHERE token_hash = $1 AND ativo = true AND deleted_at IS NULL`,
    [tokenHash]
  ).catch(() => null);

  if (!agente) {
    return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });
  }

  // Body é opcional — heartbeat puro também serve
  let body: z.infer<typeof schema> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    body = schema.parse(raw);
  } catch {
    // Tolerante: sem body também conta como heartbeat
  }

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const wasOffline = agente.status === "offline" || agente.status === "aguardando";

  await queryOne(
    `UPDATE agentes
        SET ultimo_hb_em      = NOW(),
            primeiro_hb_em    = COALESCE(primeiro_hb_em, NOW()),
            status            = 'online',
            hostname          = COALESCE($1, hostname),
            plataforma        = COALESCE($2, plataforma),
            versao            = COALESCE($3, versao),
            fila_pendente     = COALESCE($4, fila_pendente),
            ultimo_pedido_em  = COALESCE($5::timestamptz, ultimo_pedido_em),
            metadados         = COALESCE($6::jsonb, metadados),
            ip_ultimo         = COALESCE($7::inet, ip_ultimo),
            user_agent        = COALESCE($8, user_agent),
            updated_at        = NOW()
      WHERE id = $9`,
    [
      body.hostname ?? null,
      body.plataforma ?? null,
      body.versao ?? null,
      body.fila_pendente ?? null,
      body.ultimo_pedido_em ?? null,
      body.metadados ? JSON.stringify(body.metadados) : null,
      ip,
      ua,
      agente.id,
    ]
  );

  // Marca evento "online" se voltou de offline
  if (wasOffline) {
    await query(
      `INSERT INTO agentes_eventos (agente_id, empresa_id, tipo, detalhes)
       VALUES ($1, $2, 'online', $3::jsonb)`,
      [agente.id, agente.empresa_id, JSON.stringify({ ip, ua, era: agente.status })]
    ).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    agente_id: agente.id,
    next_hb_in_sec: 60,
    // Slot pra comandos remotos do master (ex: 'reload', 'reboot') — v2
    comandos: [],
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST com Authorization: Bearer rdt_<token> pra registrar heartbeat",
  });
}
