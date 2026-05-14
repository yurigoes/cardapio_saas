/**
 * POST /api/admin/mensalidades/[id]/acoes
 * Body: { acao: "reenviar_email" | "marcar_paga" | "cancelar", observacao?: string }
 *
 * Master ações sobre mensalidade específica.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { enviarEmailFatura } from "@/lib/billing/mensalidades";

const schema = z.object({
  acao:       z.enum(["reenviar_email", "marcar_paga", "cancelar"]),
  observacao: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const m = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM mensalidades WHERE id = $1`,
    [params.id]
  );
  if (!m) return badRequest("mensalidade não encontrada");

  try {
    if (body.acao === "reenviar_email") {
      const r = await enviarEmailFatura(m.id);
      return ok({ enviado: r.ok, motivo: r.motivo });
    }

    if (body.acao === "marcar_paga") {
      if (m.status === "paga") return ok({ mensagem: "já estava paga" });
      await query(
        `UPDATE mensalidades
            SET status = 'paga', pago_em = NOW(), pago_via = 'manual',
                observacoes = COALESCE(observacoes, '') || E'\n[manual] ' || $2,
                atualizado_em = NOW()
          WHERE id = $1`,
        [m.id, body.observacao ?? `marcada paga por ${auth.payload.email ?? "master"}`]
      );
      return ok({ marcada_paga: true });
    }

    if (body.acao === "cancelar") {
      await query(
        `UPDATE mensalidades
            SET status = 'cancelada',
                observacoes = COALESCE(observacoes, '') || E'\n[cancelada] ' || $2,
                atualizado_em = NOW()
          WHERE id = $1`,
        [m.id, body.observacao ?? `cancelada por ${auth.payload.email ?? "master"}`]
      );
      return ok({ cancelada: true });
    }

    return badRequest("ação inválida");
  } catch (err) {
    console.error("[Admin/Mensalidades/Acoes]", err);
    return serverError();
  }
}
