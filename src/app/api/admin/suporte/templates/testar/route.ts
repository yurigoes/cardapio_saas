/**
 * POST /api/admin/suporte/templates/testar
 * Body: { tipo, conteudo, assunto?, destino, vars? }
 *
 * Renderiza o template (substitui {vars}) e dispara via:
 *  - tipo='email': SMTP via enfileirar() com from master padrão
 *  - tipo='whatsapp': Evolution master (config /admin/integracoes/evolution)
 *
 * Master/suporte only.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { enfileirar } from "@/lib/email/smtp";
import { decryptIfNeeded } from "@/lib/security/encrypt";

const schema = z.object({
  tipo:     z.enum(["email", "whatsapp"]),
  conteudo: z.string().min(3).max(20_000),
  assunto:  z.string().max(200).optional(),
  destino:  z.string().min(3).max(120),
  vars:     z.record(z.string()).optional(),
});

function aplicar(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }
  return out.replace(/\\n/g, "\n");
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master" && auth.payload.role !== "suporte") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const vars = body.vars ?? {};
  const conteudoFinal = aplicar(body.conteudo, vars);
  const assuntoFinal  = body.assunto ? aplicar(body.assunto, vars) : "";

  if (body.tipo === "email") {
    if (!body.destino.includes("@")) return badRequest("Destino precisa ser e-mail");
    if (!assuntoFinal) return badRequest("Assunto obrigatório pra email");
    try {
      await enfileirar({
        para:    body.destino,
        evento:  "manual",
        assunto: `[TESTE] ${assuntoFinal}`,
        html:    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><div style="background:#fef3c7;padding:8px;text-align:center;font-size:11px;color:#92400e;border-radius:4px;margin-bottom:12px">⚠ TESTE — não responda este email</div>${conteudoFinal}</div>`,
      });
      return ok({ enviado: true, tipo: "email", para: body.destino });
    } catch (e) {
      return serverError(e instanceof Error ? e.message : "erro");
    }
  }

  // WhatsApp via master
  const cfg = await queryOne<{ url: string | null; api_key: string | null; instance_name: string | null }>(
    `SELECT url, api_key, instance_name FROM master_evolution_config WHERE id = 1`
  );
  if (!cfg?.url || !cfg?.api_key || !cfg?.instance_name) {
    return badRequest("Master Evolution não configurado em /admin/integracoes/evolution");
  }
  let apiKey = cfg.api_key;
  if (apiKey.startsWith("encrypted:")) {
    const dec = decryptIfNeeded(apiKey.slice(10));
    if (!dec) return serverError("Falha ao decifrar api_key");
    apiKey = dec;
  }

  const number = body.destino.replace(/\D/g, "");
  const fullNumber = number.startsWith("55") ? number : `55${number}`;

  try {
    const r = await fetch(`${cfg.url.replace(/\/+$/, "")}/message/sendText/${cfg.instance_name}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "apikey": apiKey },
      body:    JSON.stringify({ number: fullNumber, text: `🧪 TESTE\n\n${conteudoFinal}` }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!r.ok) return serverError(`Evolution ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return ok({ enviado: true, tipo: "whatsapp", para: fullNumber });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "erro");
  }
}
