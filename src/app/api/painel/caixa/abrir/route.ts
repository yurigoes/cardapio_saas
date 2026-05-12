/**
 * POST /api/painel/caixa/abrir
 *   body: { valor_abertura: number, observacoes?: string }
 *
 * Abre um novo caixa para a empresa. Falha se já há caixa aberto
 * (constraint UNIQUE parcial garante isso no banco).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, badRequest, conflict, forbidden, serverError } from "@/lib/utils/response";

const bodySchema = z.object({
  valor_abertura: z.number().min(0).max(99999.99),
  observacoes:    z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, sub: usuarioId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "caixa:abrir")) return forbidden();

  let body: z.output<typeof bodySchema>;
  try {
    const raw = await req.json();
    const r   = bodySchema.safeParse(raw);
    if (!r.success) {
      return badRequest(r.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "));
    }
    body = r.data;
  } catch {
    return badRequest("JSON inválido");
  }

  try {
    // Verifica se já há caixa aberto
    const aberto = await queryOne<{ id: string }>(
      `SELECT id FROM caixas WHERE empresa_id = $1 AND status = 'aberto' LIMIT 1`,
      [empresaId]
    );
    if (aberto) {
      return conflict("Já existe um caixa aberto. Feche-o antes de abrir um novo.");
    }

    const novo = await queryOne<{ id: string; aberto_em: string }>(
      `INSERT INTO caixas
         (empresa_id, usuario_abertura_id, valor_abertura, observacoes, status)
       VALUES ($1, $2, $3, $4, 'aberto')
       RETURNING id, aberto_em`,
      [empresaId, usuarioId, body.valor_abertura, body.observacoes ?? null]
    );

    return ok({ id: novo?.id, aberto_em: novo?.aberto_em });
  } catch (err) {
    // Race condition: o índice único parcial pode ter pegado
    const msg = err instanceof Error ? err.message : "Erro";
    if (msg.includes("idx_caixas_aberto_unique") || msg.includes("duplicate key")) {
      return conflict("Já existe um caixa aberto.");
    }
    console.error("[Caixa/Abrir]", err);
    return serverError();
  }
}
