/**
 * GET    /api/admin/suporte/templates?tipo=email|whatsapp
 * POST   /api/admin/suporte/templates
 * PATCH  /api/admin/suporte/templates/[id]
 * DELETE /api/admin/suporte/templates/[id]
 *
 * Master/suporte gerenciam biblioteca de templates pra disparo manual.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError, conflict } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master" && auth.payload.role !== "suporte") return forbidden();

  const tipo = req.nextUrl.searchParams.get("tipo");
  const conds: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (tipo === "email" || tipo === "whatsapp") {
    conds.push(`tipo = $${i++}`); vals.push(tipo);
  }

  const rows = await query(
    `SELECT id, tipo, nome, assunto, conteudo, variaveis, created_at::text
       FROM suporte_templates_msg
      ${conds.length ? "WHERE " + conds.join(" AND ") : ""}
      ORDER BY tipo, nome`,
    vals
  ).catch(() => []);

  return ok({ templates: rows });
}

const postSchema = z.object({
  tipo:     z.enum(["email", "whatsapp"]),
  nome:     z.string().min(2).max(120),
  assunto:  z.string().max(200).nullable().optional(),
  conteudo: z.string().min(3).max(20_000),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof postSchema>;
  try { body = postSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  // Extrai variáveis {var} do conteúdo
  const vars = Array.from(new Set(
    Array.from(body.conteudo.match(/\{(\w+)\}/g) || []).map(m => m.slice(1, -1))
  ));

  try {
    const r = await queryOne<{ id: string }>(
      `INSERT INTO suporte_templates_msg (tipo, nome, assunto, conteudo, variaveis, criado_por)
       VALUES ($1, $2, $3, $4, $5::text[], $6)
       RETURNING id`,
      [body.tipo, body.nome, body.assunto ?? null, body.conteudo, vars, auth.payload.sub]
    );
    return ok({ id: r?.id }, undefined, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes("duplicate")) {
      return conflict("Já existe template com esse nome+tipo");
    }
    console.error("[Templates/POST]", err);
    return serverError();
  }
}
