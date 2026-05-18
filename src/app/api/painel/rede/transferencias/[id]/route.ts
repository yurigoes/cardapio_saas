/**
 * PATCH /api/painel/rede/transferencias/[id]
 * Body: { acao: "enviar" | "receber" | "cancelar", observacao? }
 *
 * - enviar: origem confirma envio (status → em_transito)
 * - receber: destino confirma chegada (status → recebido)
 * - cancelar: qualquer um (origem/destino) cancela (status → cancelado)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

const schema = z.object({
  acao:       z.enum(["enviar", "receber", "cancelar"]),
  observacao: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const t = await queryOne<{
      id: string; status: string; filial_origem: string; filial_destino: string;
    }>(
      `SELECT id, status, filial_origem, filial_destino
         FROM transferencias_estoque WHERE id = $1`,
      [params.id]
    );
    if (!t) return notFound();

    // Permissões por ação
    if (body.acao === "enviar") {
      if (t.filial_origem !== empresaId)  return forbidden("Só a filial origem pode enviar");
      if (t.status !== "pendente")        return badRequest(`Status atual: ${t.status}`);
      await queryOne(
        `UPDATE transferencias_estoque
            SET status = 'em_transito', enviado_em = NOW(),
                observacao = COALESCE($1, observacao)
          WHERE id = $2`,
        [body.observacao ?? null, params.id]
      );
    } else if (body.acao === "receber") {
      if (t.filial_destino !== empresaId) return forbidden("Só a filial destino pode receber");
      if (t.status !== "em_transito")     return badRequest(`Status atual: ${t.status}`);
      await queryOne(
        `UPDATE transferencias_estoque
            SET status = 'recebido', recebido_em = NOW(), recebido_por = $1,
                observacao = COALESCE($2, observacao)
          WHERE id = $3`,
        [sub, body.observacao ?? null, params.id]
      );
    } else if (body.acao === "cancelar") {
      if (t.filial_origem !== empresaId && t.filial_destino !== empresaId) {
        return forbidden("Filial não envolvida");
      }
      if (t.status === "recebido")        return badRequest("Transferência já recebida");
      await queryOne(
        `UPDATE transferencias_estoque
            SET status = 'cancelado', cancelado_em = NOW(),
                observacao = COALESCE($1, observacao)
          WHERE id = $2`,
        [body.observacao ?? null, params.id]
      );
    }

    return ok({ id: params.id, acao: body.acao });
  } catch (err) {
    console.error("[Rede/Transf/PATCH]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
