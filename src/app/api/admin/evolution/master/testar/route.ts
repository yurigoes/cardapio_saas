/**
 * POST /api/admin/evolution/master/testar
 * Body: { para, mensagem? }
 *
 * Envia mensagem WhatsApp de teste usando config master.
 * Atualiza ultimo_teste_em/ok/msg no banco.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { decryptIfNeeded } from "@/lib/security/encrypt";

const schema = z.object({
  para:     z.string().min(8).max(30),
  mensagem: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const cfg = await queryOne<{
    url: string | null; api_key: string | null; instance_name: string | null;
  }>(`SELECT url, api_key, instance_name FROM master_evolution_config WHERE id = 1`);

  if (!cfg?.url || !cfg?.api_key || !cfg?.instance_name) {
    return badRequest("Configuração incompleta (url + api_key + instance_name)");
  }

  // Decifra api_key
  let apiKey = cfg.api_key;
  if (apiKey.startsWith("encrypted:")) {
    const dec = decryptIfNeeded(apiKey.slice(10));
    if (!dec) return serverError("Falha ao decifrar api_key");
    apiKey = dec;
  }

  const number = body.para.replace(/\D/g, "");
  const fullNumber = number.startsWith("55") ? number : `55${number}`;
  const texto = body.mensagem || "🤖 *Teste Three Digital*\n\nMaster Evolution funcionando ✓";

  let sucesso = false;
  let mensagem = "";

  try {
    const r = await fetch(`${cfg.url.replace(/\/+$/, "")}/message/sendText/${cfg.instance_name}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "apikey": apiKey },
      body:    JSON.stringify({ number: fullNumber, text: texto }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      sucesso = true;
      mensagem = "Enviado com sucesso";
    } else {
      mensagem = `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`;
    }
  } catch (e) {
    mensagem = e instanceof Error ? e.message : String(e);
  }

  await queryOne(
    `UPDATE master_evolution_config
        SET ultimo_teste_em = NOW(),
            ultimo_teste_ok = $1,
            ultimo_teste_msg = $2
      WHERE id = 1`,
    [sucesso, mensagem]
  ).catch(() => {});

  if (!sucesso) return serverError(mensagem);
  return ok({ enviado: true, para: fullNumber, mensagem: texto });
}
