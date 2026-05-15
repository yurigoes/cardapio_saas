/**
 * GET    /api/admin/permissoes?escopo=role|user&escopo_id=X
 *   Lista overrides + permissões default da role.
 *
 * POST   /api/admin/permissoes
 *   Body: { escopo, escopo_id, permissao, acao: 'allow'|'deny', motivo? }
 *
 * DELETE /api/admin/permissoes?escopo=X&escopo_id=Y&permissao=Z
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { invalidarPermissoesCache, PERMISSOES_POR_ROLE } from "@/lib/auth/rbac";
import type { JWTRole } from "@/lib/auth/jwt";

const ESCOPOS = ["role", "user"] as const;
const ROLES   = ["master","suporte","admin","gerente","garcom","cozinha","atendente","financeiro","delivery","motoboy","cliente"];

// Lista master de permissões disponíveis (espelha rbac.ts)
const PERMISSOES_DISPONIVEIS = [
  "empresa:ver", "empresa:editar", "empresa:criar", "empresa:deletar",
  "usuario:ver", "usuario:criar", "usuario:editar", "usuario:deletar",
  "cardapio:ver", "cardapio:editar", "cardapio:criar", "cardapio:deletar",
  "pedido:ver", "pedido:criar", "pedido:editar", "pedido:cancelar", "pedido:imprimir",
  "mesa:ver", "mesa:editar", "mesa:abrir", "mesa:fechar",
  "cozinha:ver", "cozinha:atualizar",
  "financeiro:ver", "financeiro:editar", "caixa:abrir", "caixa:fechar", "relatorio:ver",
  "delivery:ver", "delivery:atribuir", "motoboy:gerenciar",
  "estoque:ver", "estoque:editar",
  "gateway:ver", "gateway:configurar",
  "admin:tudo",
];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const sp = req.nextUrl.searchParams;
  const escopo    = sp.get("escopo") as "role" | "user" | null;
  const escopoId  = sp.get("escopo_id");

  if (!escopo || !escopoId) {
    return ok({ permissoes_disponiveis: PERMISSOES_DISPONIVEIS, roles: ROLES });
  }

  const overrides = await query(
    `SELECT permissao, acao, motivo, criado_em::text
       FROM permissoes_overrides
      WHERE escopo = $1 AND escopo_id = $2`,
    [escopo, escopoId]
  ).catch(() => []);

  // Pra escopo=role, mostra também permissões default da role
  let defaults: string[] = [];
  if (escopo === "role" && (PERMISSOES_POR_ROLE as Record<string, readonly string[]>)[escopoId]) {
    defaults = [...(PERMISSOES_POR_ROLE[escopoId as JWTRole] as readonly string[])];
  }

  return ok({
    escopo, escopo_id: escopoId,
    overrides,
    defaults,
    permissoes_disponiveis: PERMISSOES_DISPONIVEIS,
  });
}

const postSchema = z.object({
  escopo:    z.enum(ESCOPOS),
  escopo_id: z.string().min(1).max(120),
  permissao: z.string().min(3).max(50),
  acao:      z.enum(["allow", "deny"]),
  motivo:    z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof postSchema>;
  try { body = postSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    await queryOne(
      `INSERT INTO permissoes_overrides (escopo, escopo_id, permissao, acao, motivo, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (escopo, escopo_id, permissao)
         DO UPDATE SET acao = EXCLUDED.acao, motivo = EXCLUDED.motivo, criado_em = NOW()`,
      [body.escopo, body.escopo_id, body.permissao, body.acao, body.motivo ?? null, auth.payload.sub]
    );
    invalidarPermissoesCache(body.escopo, body.escopo_id);
    return ok({ ok: true });
  } catch (err) {
    console.error("[Permissoes/POST]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const sp = req.nextUrl.searchParams;
  const escopo    = sp.get("escopo");
  const escopoId  = sp.get("escopo_id");
  const permissao = sp.get("permissao");
  if (!escopo || !escopoId || !permissao) return badRequest("escopo, escopo_id e permissao obrigatórios");

  await queryOne(
    `DELETE FROM permissoes_overrides
      WHERE escopo = $1 AND escopo_id = $2 AND permissao = $3`,
    [escopo, escopoId, permissao]
  );
  invalidarPermissoesCache(escopo as "role" | "user", escopoId);
  return ok({ removido: true });
}
