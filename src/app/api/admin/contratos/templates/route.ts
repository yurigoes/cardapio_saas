/**
 * GET  /api/admin/contratos/templates → lista todos
 * POST /api/admin/contratos/templates → cria novo
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    const rows = await query(
      `SELECT id, versao, titulo, descricao, conteudo_html, tipo, ativo, created_at
         FROM contrato_templates ORDER BY ativo DESC, created_at DESC`
    );
    return ok(rows);
  } catch (err) {
    console.error("[Contratos/Templates/GET]", err);
    return serverError();
  }
}

const schema = z.object({
  versao:        z.string().min(1).max(50),
  titulo:        z.string().min(3).max(200),
  descricao:     z.string().max(500).optional(),
  conteudo_html: z.string().min(10),
  tipo:          z.enum(["onboarding", "aditivo", "servico_extra"]).default("onboarding"),
  ativo:         z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const r = await queryOne<{ id: string }>(
      `INSERT INTO contrato_templates (versao, titulo, descricao, conteudo_html, tipo, ativo)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [body.versao, body.titulo, body.descricao ?? null, body.conteudo_html, body.tipo, body.ativo]
    );
    return created({ id: r?.id });
  } catch (err) {
    console.error("[Contratos/Templates/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
