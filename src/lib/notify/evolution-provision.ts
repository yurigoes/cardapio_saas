/**
 * Provisionamento automático de instância Evolution pra uma empresa.
 *
 * Quando admin cria uma nova empresa (ou filial), opcionalmente já cria
 * a instância Evolution correspondente usando o servidor configurado em
 * master_evolution_config OU env vars.
 *
 * A instância criada usa empresa.slug como instance name e fica disponível
 * pra conexão via QR code em /painel/integracoes.
 */
import { queryOne } from "@/lib/db/client";

interface ResultadoProvisionamento {
  ok:        boolean;
  ja_existia?: boolean;
  instance?: string;
  motivo?:   string;
}

/**
 * Cria instância Evolution pra uma empresa (idempotente).
 * Retorna ok=true se criada OU se já existia.
 */
export async function provisionarEvolution(empresaId: string): Promise<ResultadoProvisionamento> {
  const empresa = await queryOne<{ slug: string; nome_fantasia: string; evolution_url: string | null; evolution_key: string | null }>(
    `SELECT slug, nome_fantasia, evolution_url, evolution_key FROM empresas WHERE id = $1`,
    [empresaId]
  );
  if (!empresa) return { ok: false, motivo: "empresa não encontrada" };

  // Determina URL e key globais
  const evoUrl = empresa.evolution_url
              || process.env.EVOLUTION_PUBLIC_URL
              || process.env.EVOLUTION_API_URL;

  // Resolve key: tenta env primeiro, depois master_evolution_config
  let evoKey: string | null = empresa.evolution_key
                            || process.env.EVOLUTION_API_KEY
                            || null;

  if (!evoKey) {
    const master = await queryOne<{ api_key: string | null }>(
      `SELECT api_key FROM master_evolution_config WHERE id = 1 AND ativo = TRUE`
    ).catch(() => null);
    if (master?.api_key) {
      // Respeita prefix "encrypted:"
      if (master.api_key.startsWith("encrypted:")) {
        try {
          const { decrypt } = await import("@/lib/security/encrypt");
          evoKey = decrypt(master.api_key.slice(10));
        } catch (e) {
          console.warn("[Provision] decrypt master.api_key falhou", e);
        }
      } else {
        evoKey = master.api_key;
      }
    }
  }

  if (!evoUrl || !evoKey) {
    return { ok: false, motivo: "Sem URL/key do Evolution configurados" };
  }

  const instanceName = empresa.slug;
  const baseUrl = evoUrl.replace(/\/+$/, "");

  // Verifica se já existe
  try {
    const check = await fetch(`${baseUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
      headers: { "apikey": evoKey },
      signal: AbortSignal.timeout(8000),
    });
    if (check.ok) {
      const d = await check.json().catch(() => null);
      const lista = Array.isArray(d) ? d : (d?.instance ? [d] : []);
      if (lista.length > 0) {
        return { ok: true, ja_existia: true, instance: instanceName };
      }
    }
  } catch (e) {
    console.warn("[Provision] fetchInstances falhou:", e);
  }

  // Cria instância
  try {
    const r = await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": evoKey },
      body: JSON.stringify({
        instanceName,
        qrcode:    true,
        integration: "WHATSAPP-BAILEYS",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return { ok: false, motivo: `HTTP ${r.status}: ${txt.slice(0, 200)}` };
    }
    const d = await r.json().catch(() => null);
    const novaKey = d?.hash?.apikey ?? d?.apikey ?? d?.instance?.apikey ?? null;

    // Salva url+key na empresa pra próximas chamadas usarem
    await queryOne(
      `UPDATE empresas
          SET evolution_url = COALESCE(evolution_url, $1),
              evolution_key = COALESCE(evolution_key, $2),
              updated_at = NOW()
        WHERE id = $3`,
      [evoUrl, novaKey ?? evoKey, empresaId]
    ).catch(() => null);

    console.info(`[Provision] criada instância ${instanceName} pra empresa=${empresaId}`);
    return { ok: true, instance: instanceName };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "erro inesperado" };
  }
}
