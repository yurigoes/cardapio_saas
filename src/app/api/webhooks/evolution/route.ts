/**
 * POST /api/webhooks/evolution
 * Recebe eventos da Evolution API (mensagens recebidas, QR atualizado, etc.)
 * Rota pública — valida via header apikey interno
 */
import { NextRequest } from "next/server";
import { ok, unauthorized } from "@/lib/utils/response";

interface EvolutionEvent {
  event:         string;
  instance:      string;
  data?:         unknown;
  apikey?:       string;
}

export async function POST(req: NextRequest) {
  // Valida que veio da Evolution interna
  const apikey = req.headers.get("apikey");
  if (apikey && apikey !== process.env.EVOLUTION_API_KEY) {
    return unauthorized("apikey inválida");
  }

  let payload: EvolutionEvent;
  try {
    payload = await req.json();
  } catch {
    return ok({ received: false });
  }

  const { event, instance, data } = payload;
  console.log(`[Evolution Webhook] ${event} → ${instance}`);

  // Processa eventos relevantes
  switch (event) {
    case "connection.update": {
      const state = (data as { state?: string })?.state;
      console.log(`[Evolution] ${instance} → ${state}`);
      // TODO: atualizar status da empresa no Redis/DB para notificar frontend
      break;
    }

    case "messages.upsert": {
      // Mensagem recebida — pode triggar N8N ou resposta automática
      const message = data as { key?: { remoteJid?: string }; message?: { conversation?: string } };
      const from    = message?.key?.remoteJid;
      const text    = message?.message?.conversation;
      if (from && text) {
        console.log(`[Evolution] Mensagem de ${from}: ${text?.slice(0, 50)}`);
        // TODO: rotear para N8N via webhook interno
      }
      break;
    }

    case "qrcode.updated": {
      // QR code foi atualizado — frontend pode fazer polling
      console.log(`[Evolution] QR atualizado para ${instance}`);
      break;
    }
  }

  return ok({ received: true });
}
