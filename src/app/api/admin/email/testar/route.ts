/**
 * POST /api/admin/email/testar
 * Body: { destino: string, evento?: string }
 *
 * Envia e-mail de teste pra verificar config SMTP. Default: usa template
 * 'boas_vindas' com vars dummy. Pode passar evento específico.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { enfileirar, processarQueue } from "@/lib/email/smtp";

const schema = z.object({
  destino: z.string().email(),
  evento:  z.string().min(1).max(50).default("boas_vindas"),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const r = await enfileirar({
      para:    body.destino,
      evento:  body.evento,
      vars: {
        empresa_nome: "Empresa de Teste",
        plano_nome:   "Profissional",
        painel_url:   process.env.NEXT_PUBLIC_APP_URL ?? "https://app.example.com",
        usuario_nome: "Operador",
        codigo:       "123456",
      },
      contexto: { tipo: "teste_admin", solicitante: auth.payload.sub },
    });

    if (!r.jobId) {
      return ok({
        enfileirado: false,
        motivo:      r.motivo ?? "?",
        mensagem:    `Não foi possível enfileirar: ${r.motivo}`,
      });
    }

    // Tenta processar agora pra dar feedback síncrono
    const proc = await processarQueue(1);

    return ok({
      enfileirado: true,
      job_id:      r.jobId,
      processado:  proc.processados > 0,
      sucesso:     proc.sucesso > 0,
      mensagem:    proc.sucesso > 0
        ? `✓ E-mail enviado pra ${body.destino}`
        : proc.falha > 0
          ? `✗ Tentou enviar mas falhou — verifique config e logs`
          : "Enfileirado. Worker próximo ciclo enviará.",
    });
  } catch (err) {
    console.error("[Email/Testar]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
