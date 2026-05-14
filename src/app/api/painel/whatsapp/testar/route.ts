/**
 * POST /api/painel/whatsapp/testar
 * Body: { numero?: string }   // se ausente, manda pro próprio whatsapp da empresa
 *
 * Envia mensagem de teste pela instância Evolution configurada da empresa.
 * Útil pra verificar se a integração está funcionando antes de depender
 * dela em produção (notificações de pedido, aniversário, mala direta).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { getSaasBranding } from "@/lib/branding/server";

const ALLOWED = ["master", "admin", "gerente"];

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let numero: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.numero) numero = String(body.numero).replace(/\D/g, "");
  } catch {}

  // Se não passou número, usa o whatsapp da empresa
  if (!numero) {
    const e = await queryOne<{ whatsapp: string | null }>(
      `SELECT whatsapp FROM empresas WHERE id = $1`,
      [empresaId]
    );
    numero = (e?.whatsapp ?? "").replace(/\D/g, "");
    if (!numero) return badRequest("Sem número configurado na empresa — passe 'numero' no body");
  }

  // Instância Evolution = slug da empresa (convenção do whatsapp/instancia/route.ts)
  const e = await queryOne<{ slug: string }>(
    `SELECT slug FROM empresas WHERE id = $1`, [empresaId]
  );
  const instanceName = e?.slug;
  if (!instanceName) return badRequest("Empresa sem slug configurado");

  const evoUrl = process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const evoKey = process.env.EVOLUTION_API_KEY;
  if (!evoKey) return serverError("EVOLUTION_API_KEY não configurada no servidor");

  const branding = await getSaasBranding();
  try {
    const r = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": evoKey },
      body: JSON.stringify({
        number: numero,
        text:   `🧪 Teste do ${branding.nome}\n\nSe você recebeu esta mensagem, sua integração com o WhatsApp está funcionando corretamente.\n\nHora: ${new Date().toLocaleString("pt-BR")}`,
      }),
    });
    const data = await r.json().catch(() => ({}));
    return ok({
      enviado:    r.ok,
      status:     r.status,
      destino:    numero,
      instancia:  instanceName,
      resposta:   data,
    });
  } catch (err) {
    console.error("[Whatsapp/Testar]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
