/**
 * POST /api/admin/vps/alertas/teste
 *
 * Dispara mensagem de teste pelo canal de alertas configurado em
 * /api/admin/vps/alertas. Útil pra verificar se o WhatsApp está
 * realmente entregando antes de depender disso em produção.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, forbidden, serverError } from "@/lib/utils/response";
import { enviarAlertaWhatsApp } from "@/lib/security/alertas";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    const ts = new Date().toLocaleString("pt-BR");
    const enviado = await enviarAlertaWhatsApp(
      `🧪 *Teste de alertas VPS*\n\nEstá funcionando! Mensagem disparada em ${ts}.\n\nSe você recebeu isso, alertas críticos do servidor (deploy/erros/manutenção) chegarão por aqui.`
    );

    return ok({
      enviado,
      mensagem: enviado
        ? `✓ Mensagem de teste enviada com sucesso (${ts})`
        : "✗ Falha ao enviar — verifique whatsapp/instância configurados em /admin/vps",
    });
  } catch (err) {
    console.error("[VPS/Alertas/Teste]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
