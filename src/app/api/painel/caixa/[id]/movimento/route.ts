/**
 * POST /api/painel/caixa/[id]/movimento
 *   body: { tipo: "sangria"|"reforco", valor: number, descricao?: string }
 *
 * Sangria  = retirada de dinheiro do caixa (sem ser para venda)
 * Reforço  = aporte de dinheiro no caixa (troco extra, fundo)
 *
 * Não permite movimento em caixa fechado.
 * Não permite tipo "venda" ou "estorno" via este endpoint (são gerados internamente).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, badRequest, notFound, forbidden, serverError } from "@/lib/utils/response";

const bodySchema = z.object({
  tipo:      z.enum(["sangria", "reforco"]),
  valor:     z.number().positive().max(99999.99),
  descricao: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, sub: usuarioId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "caixa:fechar")) return forbidden();

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
    const caixa = await queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM caixas
       WHERE id = $1 AND empresa_id = $2`,
      [params.id, empresaId]
    );

    if (!caixa)                    return notFound("Caixa não encontrado");
    if (caixa.status !== "aberto") return badRequest("Caixa está fechado");

    const mov = await queryOne<{ id: string; criado_em: string }>(
      `INSERT INTO caixa_movimentos
         (caixa_id, empresa_id, usuario_id, tipo, valor, descricao)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, criado_em`,
      [params.id, empresaId, usuarioId, body.tipo, body.valor, body.descricao ?? null]
    );

    return ok({
      id:        mov?.id,
      tipo:      body.tipo,
      valor:     body.valor,
      criado_em: mov?.criado_em,
    });
  } catch (err) {
    console.error("[Caixa/Movimento]", err);
    return serverError();
  }
}
