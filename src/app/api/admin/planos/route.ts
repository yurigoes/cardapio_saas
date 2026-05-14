import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { z } from "zod";

function assertMaster(role: string) {
  if (role !== "master") throw new Error("forbidden");
}

const planoSchema = z.object({
  nome:      z.string().min(2).max(100).trim(),
  descricao: z.string().max(500).trim().optional(),
  preco:     z.number().min(0),
  periodo:   z.enum(["mensal", "anual", "unico"]).default("mensal"),
  modulos:   z.array(z.string()).default([]),
  limites: z.object({
    usuarios:    z.number().int().min(-1).default(5),
    produtos:    z.number().int().min(-1).default(100),
    mesas:       z.number().int().min(-1).default(20),
    pedidos_mes: z.number().int().min(-1).default(1000),
  }).default({}),
  ativo:    z.boolean().default(true),
  destaque: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  try { assertMaster(auth.payload.role); } catch { return forbidden(); }

  try {
    // Inclui inativos pra UI mostrar como obsoletos (lista expansível)
    const planos = await query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM empresas e WHERE e.plano_id = p.id AND e.deleted_at IS NULL) as total_empresas
       FROM planos p
       ORDER BY p.ativo DESC, COALESCE(p.preco_mensal, p.preco) ASC`
    );
    return ok(planos);
  } catch (err) {
    console.error("[Admin/Planos/GET]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  try { assertMaster(auth.payload.role); } catch { return forbidden(); }

  let body: z.infer<typeof planoSchema>;
  try {
    body = planoSchema.parse(await req.json());
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  try {
    // Insere preco_mensal = preco (mantém os 2 campos sincronizados)
    const plano = await queryOne<{ id: string }>(
      `INSERT INTO planos (nome, descricao, preco, preco_mensal, periodo, modulos, limites, ativo, destaque)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        body.nome,
        body.descricao ?? null,
        body.preco,
        body.periodo,
        JSON.stringify(body.modulos),
        JSON.stringify(body.limites),
        body.ativo,
        body.destaque,
      ]
    );
    return created({ id: plano?.id });
  } catch (err) {
    console.error("[Admin/Planos/POST]", err);
    return serverError();
  }
}
