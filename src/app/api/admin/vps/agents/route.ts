/**
 * GET  /api/admin/vps/agents — lista
 * POST /api/admin/vps/agents — cria + retorna key UMA VEZ
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();
  try {
    const rows = await query(
      `SELECT id, nome, prefix, ativo,
              ultimo_ping,
              EXTRACT(EPOCH FROM (NOW() - ultimo_ping))::int AS pingou_ha_seg,
              ultimo_ip::text AS ultimo_ip,
              versao, hostname, ultimo_status, created_at
         FROM vps_agents ORDER BY created_at DESC`
    );
    return ok(rows);
  } catch (err) {
    console.error("[VPS/Agents/GET]", err);
    return serverError();
  }
}

const createSchema = z.object({ nome: z.string().min(1).max(100).trim() });

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof createSchema>;
  try { body = createSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const raw     = crypto.randomBytes(24).toString("base64url");
    const fullKey = `vak_${raw}`;
    const prefix  = fullKey.slice(0, 12);
    const hash    = crypto.createHash("sha256").update(fullKey).digest("hex");

    const r = await queryOne<{ id: string }>(
      `INSERT INTO vps_agents (nome, prefix, agent_key_hash) VALUES ($1, $2, $3) RETURNING id`,
      [body.nome, prefix, hash]
    );
    return created({
      id: r?.id, nome: body.nome, prefix, agent_key: fullKey,
      aviso: "Salve esta key agora. Não vai ser exibida de novo.",
    });
  } catch (err) {
    console.error("[VPS/Agents/POST]", err);
    return serverError();
  }
}
