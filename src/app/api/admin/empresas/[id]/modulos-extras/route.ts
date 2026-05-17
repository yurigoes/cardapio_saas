/**
 * GET    /api/admin/empresas/[id]/modulos-extras       → lista extras
 * POST   /api/admin/empresas/[id]/modulos-extras       → adiciona/atualiza
 *   { modulo, tipo: experimental|alacarte|gratuito, dias?, preco?, observacao? }
 * DELETE /api/admin/empresas/[id]/modulos-extras?modulo=xxx → revoga
 *
 * - experimental: vence em `dias` dias
 * - alacarte:     gera cobrança (TODO: integrar mensalidades), bloqueio em 24h se não pagar
 * - gratuito:     sem expiração, ativo até revogar
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError, notFound } from "@/lib/utils/response";

const ALLOWED = ["master"];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  try {
    const rows = await query(
      `SELECT id, modulo, tipo, preco, expira_em, bloqueado,
              observacao, created_at, updated_at
         FROM empresa_modulos_extras
        WHERE empresa_id = $1
        ORDER BY created_at DESC`,
      [params.id]
    );
    return ok(rows);
  } catch (err) {
    console.error("[ModExtras/GET]", err);
    return serverError();
  }
}

const addSchema = z.object({
  modulo:     z.string().min(2).max(50),
  tipo:       z.enum(["experimental", "alacarte", "gratuito"]),
  dias:       z.number().int().positive().max(365).optional(),  // exigido p/ experimental
  preco:      z.number().nonnegative().optional(),               // exigido p/ alacarte
  observacao: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  let body: z.infer<typeof addSchema>;
  try { body = addSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  if (body.tipo === "experimental" && !body.dias) return badRequest("Para experimental, informe 'dias'");
  if (body.tipo === "alacarte" && body.preco === undefined) return badRequest("Para alacarte, informe 'preco'");

  try {
    const expira_em = body.tipo === "experimental"
      ? new Date(Date.now() + (body.dias! * 24 * 60 * 60 * 1000)).toISOString()
      : body.tipo === "alacarte"
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()   // 24h pra pagar
        : null;

    const r = await queryOne<{ id: string }>(
      `INSERT INTO empresa_modulos_extras
         (empresa_id, modulo, tipo, preco, expira_em, observacao, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (empresa_id, modulo) DO UPDATE
         SET tipo       = EXCLUDED.tipo,
             preco      = EXCLUDED.preco,
             expira_em  = EXCLUDED.expira_em,
             observacao = EXCLUDED.observacao,
             bloqueado  = FALSE,
             updated_at = NOW()
       RETURNING id`,
      [params.id, body.modulo, body.tipo, body.preco ?? 0,
       expira_em, body.observacao ?? null, auth.payload.sub]
    );

    // TODO: se alacarte, criar cobrança na tabela mensalidades + agendar verificação 24h
    return ok({ id: r?.id, expira_em });
  } catch (err) {
    console.error("[ModExtras/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  const modulo = req.nextUrl.searchParams.get("modulo");
  if (!modulo) return badRequest("Param 'modulo' obrigatório");

  try {
    const r = await queryOne<{ id: string }>(
      `DELETE FROM empresa_modulos_extras
        WHERE empresa_id = $1 AND modulo = $2 RETURNING id`,
      [params.id, modulo]
    );
    if (!r) return notFound();
    return ok({ removido: true });
  } catch (err) {
    console.error("[ModExtras/DELETE]", err);
    return serverError();
  }
}
