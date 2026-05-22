/**
 * Helper Mercado Pago — assinatura recorrente (PreApproval).
 *
 * Env: MP_ACCESS_TOKEN  (access token da sua conta MP)
 *      APP_URL          (base pública da landing, ex https://midiaindoor.tthreedigital.com.br)
 */
const MP_TOKEN = process.env.MP_ACCESS_TOKEN ?? "";
const APP_URL  = (process.env.APP_URL ?? "https://midiaindoor.tthreedigital.com.br").replace(/\/+$/, "");
const MP_API   = "https://api.mercadopago.com";

interface PreApprovalResp {
  id: string;
  init_point: string;
  status: string;
}

/** Cria assinatura recorrente mensal. Retorna URL pro cliente pagar. */
export async function criarPreApproval(opts: {
  assinaturaId: string;
  email: string;
  valorMensal: number;
  descricao: string;
}): Promise<{ id: string; init_point: string }> {
  if (!MP_TOKEN) throw new Error("MP_ACCESS_TOKEN não configurado");

  const r = await fetch(`${MP_API}/preapproval`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${MP_TOKEN}` },
    body: JSON.stringify({
      reason: opts.descricao,
      external_reference: opts.assinaturaId,
      payer_email: opts.email,
      back_url: `${APP_URL}/painel?pago=1`,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number(opts.valorMensal.toFixed(2)),
        currency_id: "BRL",
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data = await r.json() as PreApprovalResp & { message?: string };
  if (!r.ok || !data.init_point) {
    throw new Error(`MP preapproval falhou: ${data.message ?? JSON.stringify(data).slice(0, 200)}`);
  }
  return { id: data.id, init_point: data.init_point };
}

/** Consulta status de um preapproval. */
export async function consultarPreApproval(id: string): Promise<{ status: string; external_reference?: string }> {
  const r = await fetch(`${MP_API}/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json() as { status: string; external_reference?: string };
  return data;
}
