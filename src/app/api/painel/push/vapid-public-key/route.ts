/**
 * GET /api/painel/push/vapid-public-key
 *
 * Retorna a chave pública VAPID (necessária para o navegador
 * gerar a inscrição via PushManager.subscribe).
 *
 * Não exige auth — chave pública é, por definição, pública.
 * Disabled silenciosamente se não configurada.
 */
import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  const pub = getVapidPublicKey();
  if (!pub) {
    return NextResponse.json(
      { success: false, configured: false, error: "Push notifications não configuradas" },
      { status: 200 }
    );
  }
  return NextResponse.json({ success: true, configured: true, key: pub });
}
