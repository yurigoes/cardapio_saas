/**
 * GET   /api/admin/email/templates — lista templates
 * POST  /api/admin/email/templates — cria/upsert por evento
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    const rows = await query(
      `SELECT id, evento, assunto, html, texto, ativo, descricao, variaveis, updated_at
         FROM email_templates ORDER BY evento`
    );
    return ok(rows);
  } catch (err) {
    console.error("[Email/Templates/GET]", err);
    return serverError();
  }
}

const upsertSchema = z.object({
  evento:    z.string().min(1).max(50),
  assunto:   z.string().min(1).max(200),
  html:      z.string().min(1).max(50_000),
  texto:     z.string().max(5000).nullable().optional(),
  ativo:     z.boolean().optional(),
  descricao: z.string().max(500).nullable().optional(),
  variaveis: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof upsertSchema>;
  try { body = upsertSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const r = await queryOne<{ id: string }>(
      `INSERT INTO email_templates (evento, assunto, html, texto, ativo, descricao, variaveis, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW())
       ON CONFLICT (evento) DO UPDATE
         SET assunto    = EXCLUDED.assunto,
             html       = EXCLUDED.html,
             texto      = EXCLUDED.texto,
             ativo      = EXCLUDED.ativo,
             descricao  = EXCLUDED.descricao,
             variaveis  = EXCLUDED.variaveis,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
       RETURNING id`,
      [
        body.evento, body.assunto, body.html, body.texto ?? null,
        body.ativo ?? true, body.descricao ?? null,
        JSON.stringify(body.variaveis ?? []),
        auth.payload.sub,
      ]
    );
    return ok({ id: r?.id });
  } catch (err) {
    console.error("[Email/Templates/POST]", err);
    return serverError();
  }
}
