/**
 * GET  /api/painel/impressoras   → lista
 * POST /api/painel/impressoras   → cria
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin", "gerente"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const rows = await query(
      `SELECT id, nome, setor, tipo, ip, porta, largura_cols, ativa,
              ultimo_ping, created_at
         FROM impressoras
        WHERE empresa_id = $1
        ORDER BY setor, nome`,
      [empresaId]
    );
    return ok(rows);
  } catch (err) {
    console.error("[Impressoras/GET]", err);
    return serverError();
  }
}

const createSchema = z.object({
  nome:         z.string().min(1).max(100).trim(),
  setor:        z.enum(["cozinha", "bar", "balcao", "retirada", "caixa"]),
  tipo:         z.enum(["tcp", "usb", "system"]).default("tcp"),
  ip:           z.string().max(45).optional(),
  porta:        z.number().int().min(1).max(65535).default(9100),
  largura_cols: z.number().int().min(20).max(80).default(48),
  ativa:        z.boolean().default(true),
});

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
    const r = await queryOne<{ id: string }>(
      `INSERT INTO impressoras
         (empresa_id, nome, setor, tipo, ip, porta, largura_cols, ativa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [empresaId, body.nome, body.setor, body.tipo, body.ip ?? null,
       body.porta, body.largura_cols, body.ativa]
    );
    return created({ id: r?.id });
  } catch (err) {
    console.error("[Impressoras/POST]", err);
    return serverError();
  }
}
