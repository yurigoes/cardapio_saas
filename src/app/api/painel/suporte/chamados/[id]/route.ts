/**
 * GET   /api/painel/suporte/chamados/[id]            — detalhe + mensagens
 * PATCH /api/painel/suporte/chamados/[id]            — atualiza status/prioridade/atribuição
 *
 * Empresa vê só o próprio. Master vê todos.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role } = auth.payload;

  const onlyEmpresa = role !== "master" && role !== "suporte";
  const chamado = await queryOne(
    `SELECT c.*, e.nome_fantasia AS empresa_nome
       FROM suporte_chamados c
       JOIN empresas e ON e.id = c.empresa_id
      WHERE c.id = $1 ${onlyEmpresa ? "AND c.empresa_id = $2" : ""}`,
    onlyEmpresa ? [params.id, empresaId] : [params.id]
  );
  if (!chamado) return notFound("chamado não encontrado");

  const msgs = await query(
    `SELECT id, autor_id, autor_tipo, autor_nome, texto, anexos, interno,
            criado_em::text, lido_em::text
       FROM suporte_mensagens
      WHERE chamado_id = $1
        ${role !== "master" && role !== "suporte" ? "AND interno = FALSE" : ""}
      ORDER BY criado_em ASC`,
    [params.id]
  ).catch(() => []);

  // Marca como lidas (msgs do outro lado)
  const isAgent = role === "master" || role === "suporte";
  await queryOne(
    `UPDATE suporte_mensagens SET lido_em = NOW()
      WHERE chamado_id = $1 AND lido_em IS NULL
        AND autor_tipo != $2`,
    [params.id, isAgent ? "agente" : "cliente"]
  ).catch(() => {});

  return ok({ chamado, mensagens: msgs });
}

const patchSchema = z.object({
  status:      z.enum(["aberto","em_andamento","aguardando_cliente","resolvido","fechado"]).optional(),
  prioridade:  z.enum(["baixa","normal","alta","urgente"]).optional(),
  atribuido_a: z.string().uuid().nullable().optional(),
  tags:        z.array(z.string().max(50)).optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master" && auth.payload.role !== "suporte") return forbidden();

  let body: z.infer<typeof patchSchema>;
  try { body = patchSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  if (Object.keys(body).length === 0) return badRequest("nada pra atualizar");

  try {
    const sets: string[] = [];
    const params2: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      sets.push(`${k} = $${i++}`);
      params2.push(v);
    }
    sets.push(`atualizado_em = NOW()`);
    if (body.status === "fechado" || body.status === "resolvido") {
      sets.push(`fechado_em = NOW()`);
    }
    if (body.atribuido_a !== undefined) {
      sets.push(`primeira_resposta_em = COALESCE(primeira_resposta_em, NOW())`);
    }
    params2.push(params.id);

    await queryOne(
      `UPDATE suporte_chamados SET ${sets.join(", ")} WHERE id = $${i}`,
      params2
    );
    return ok({ ok: true });
  } catch (err) {
    console.error("[Chamados/PATCH]", err);
    return serverError();
  }
}
