/**
 * GET  /api/painel/print-agents   → lista
 * POST /api/painel/print-agents   → cria + RETORNA agent_key UMA VEZ
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";
import crypto from "crypto";

const ALLOWED = ["master", "admin"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const rows = await query(
      `SELECT id, nome, prefix, ativo, ultimo_ping, ultimo_ip::text AS ultimo_ip,
              versao, created_at
         FROM print_agents
        WHERE empresa_id = $1
        ORDER BY created_at DESC`,
      [empresaId]
    );
    return ok(rows);
  } catch (err) {
    console.error("[PrintAgents/GET]", err);
    return serverError();
  }
}

const createSchema = z.object({ nome: z.string().min(1).max(100).trim() });

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof createSchema>;
  try { body = createSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const raw     = crypto.randomBytes(24).toString("base64url");
    const fullKey = `pak_${raw}`;
    const prefix  = fullKey.slice(0, 12);
    const hash    = crypto.createHash("sha256").update(fullKey).digest("hex");

    const r = await queryOne<{ id: string }>(
      `INSERT INTO print_agents (empresa_id, nome, prefix, agent_key_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [empresaId, body.nome, prefix, hash]
    );

    return created({
      id:        r?.id,
      nome:      body.nome,
      prefix,
      agent_key: fullKey,
      empresa_id: empresaId,
      aviso:     "Salve esta key agora. Não vai ser exibida de novo.",
    });
  } catch (err) {
    console.error("[PrintAgents/POST]", err);
    return serverError();
  }
}
