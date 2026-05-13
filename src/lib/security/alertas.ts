/**
 * Helpers para enviar alertas via Evolution (WhatsApp).
 * Lê config de vps_alertas_config (1 registro singleton).
 */
import { queryOne } from "@/lib/db/client";

interface Config {
  whatsapp: string | null;
  ativo: boolean;
  evolution_instance: string | null;
}

async function loadConfig(): Promise<Config | null> {
  return queryOne<Config>(
    `SELECT whatsapp, ativo, evolution_instance FROM vps_alertas_config LIMIT 1`
  ).catch(() => null);
}

/**
 * Envia mensagem via Evolution API. Best-effort — loga erro mas não lança.
 * Retorna true se enviou, false caso contrário.
 */
export async function enviarAlertaWhatsApp(mensagem: string): Promise<boolean> {
  const cfg = await loadConfig();
  if (!cfg || !cfg.ativo || !cfg.whatsapp || !cfg.evolution_instance) return false;

  const evoUrl = process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const evoKey = process.env.EVOLUTION_API_KEY;
  if (!evoKey) {
    console.warn("[alertas] EVOLUTION_API_KEY não configurada");
    return false;
  }

  const numero = cfg.whatsapp.replace(/\D/g, "");
  if (numero.length < 10) return false;

  try {
    const r = await fetch(`${evoUrl}/message/sendText/${cfg.evolution_instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": evoKey },
      body: JSON.stringify({
        number: numero,
        text:   mensagem.slice(0, 4000),
      }),
    });
    const ok = r.ok;
    await queryOne(
      `UPDATE vps_alertas_config
          SET ultimo_envio = NOW(), ultimo_status = $1, ultimo_erro = $2`,
      [ok ? "ok" : "falha", ok ? null : `HTTP ${r.status}`]
    ).catch(() => {});
    return ok;
  } catch (err) {
    await queryOne(
      `UPDATE vps_alertas_config
          SET ultimo_envio = NOW(), ultimo_status = 'falha', ultimo_erro = $1`,
      [(err as Error).message.slice(0, 500)]
    ).catch(() => {});
    return false;
  }
}
