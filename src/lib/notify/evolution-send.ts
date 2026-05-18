/**
 * Helper LOW-LEVEL pra enviar texto via Evolution, reusando exatamente
 * a mesma lógica de fallback que `notificarEvolution` em evolution.ts:
 *   1. empresa.evolution_url + empresa.evolution_key (cadastrados pela empresa)
 *   2. process.env.EVOLUTION_PUBLIC_URL/EVOLUTION_API_URL + EVOLUTION_API_KEY
 *
 * Diferente de notificarEvolution, NÃO usa templates/eventos — só manda
 * o texto que você passar. Útil pra OTP, 2FA, alertas ad-hoc.
 */
import { queryOne } from "@/lib/db/client";

interface EmpresaEvo {
  slug:           string;
  evolution_url:  string | null;
  evolution_key:  string | null;
}

export interface ResultadoEnvio {
  enviado:  boolean;
  via:      "empresa" | "env" | null;
  status?:  number;
  detalhe?: string;
}

function normalizarTelefone(tel: string): string {
  const digits = tel.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

/**
 * Envia texto direto via Evolution da empresa (com fallback env).
 * Retorna detalhes pra debug.
 */
export async function enviarTextoEvolution(
  empresaId: string,
  telefone:  string,
  texto:     string,
): Promise<ResultadoEnvio> {
  const empresa = await queryOne<EmpresaEvo>(
    `SELECT slug, evolution_url, evolution_key FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
    [empresaId]
  );
  if (!empresa) return { enviado: false, via: null, detalhe: "Empresa não encontrada" };

  const evoUrl = empresa.evolution_url || process.env.EVOLUTION_PUBLIC_URL || process.env.EVOLUTION_API_URL || null;
  const evoKey = empresa.evolution_key || process.env.EVOLUTION_API_KEY || null;
  const via: "empresa" | "env" = empresa.evolution_key ? "empresa" : "env";

  if (!evoUrl || !evoKey) {
    return { enviado: false, via: null, detalhe: "Sem URL/key (nem empresa nem env)" };
  }

  const number  = normalizarTelefone(telefone);
  const baseUrl = evoUrl.replace(/\/+$/, "");
  const url     = `${baseUrl}/message/sendText/${empresa.slug}`;

  try {
    const r = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "apikey": evoKey },
      body:    JSON.stringify({ number, text: texto }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      return { enviado: true, via, status: r.status, detalhe: `via ${via}` };
    }
    const body = await r.text().catch(() => "");
    return { enviado: false, via, status: r.status, detalhe: `HTTP ${r.status}: ${body.slice(0, 150)}` };
  } catch (err) {
    return { enviado: false, via, detalhe: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}
