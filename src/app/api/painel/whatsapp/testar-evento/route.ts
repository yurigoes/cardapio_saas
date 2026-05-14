/**
 * POST /api/painel/whatsapp/testar-evento
 * Body: { evento: EvolutionEvento, telefone?: string }
 *
 * Roda notificarEvolution com dados de teste pra um evento específico.
 * Retorna { enviado, motivo } pra UI mostrar exatamente o que falhou
 * (ex: "evento não habilitado", "sem telefone destinatário", "http 401").
 *
 * Útil pra debug: usuário clica "Testar este evento" no /painel/integracoes
 * e descobre porque um evento não está disparando em produção.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import {
  notificarEvolution,
  EVENTOS_VALIDOS,
  type EvolutionEvento,
} from "@/lib/notify/evolution";

const ALLOWED = ["master", "admin", "gerente"];

const bodySchema = z.object({
  evento:   z.enum(EVENTOS_VALIDOS as [EvolutionEvento, ...EvolutionEvento[]]),
  telefone: z.string().min(8).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.output<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    const r = await notificarEvolution(empresaId, body.evento, {
      telefone:     body.telefone ?? null,
      pedidoNumero: 9999, // número de teste
      clienteNome:  "Cliente Teste",
      total:        99.90,
    });

    return ok({
      evento:   body.evento,
      enviado:  r.enviado,
      motivo:   r.motivo ?? null,
      mensagem: r.enviado
        ? "✓ Mensagem de teste enviada"
        : `✗ Não enviou: ${r.motivo}`,
    });
  } catch (err) {
    console.error("[WhatsApp/TestarEvento]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
