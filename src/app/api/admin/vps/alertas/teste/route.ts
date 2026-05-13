/**
 * POST /api/admin/vps/alertas/teste — envia mensagem de teste
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, forbidden } from "@/lib/utils/response";
import { enviarAlertaWhatsApp } from "@/lib/security/alertas";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const enviado = await enviarAlertaWhatsApp(
    `🧪 Teste do alerta da VPS\n\nSe você recebeu esta mensagem, a integração com a Evolution está funcionando.\n\nHora: ${new Date().toLocaleString("pt-BR")}`
  );

  return ok({
    enviado,
    mensagem: enviado
      ? "Mensagem enviada — verifique o WhatsApp configurado"
      : "Falha no envio. Confira: alerta ativo, whatsapp preenchido, evolution_instance configurada, EVOLUTION_API_KEY no .env",
  });
}
