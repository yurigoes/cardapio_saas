/**
 * POST /api/pub/contato — recebe formulário de contato do site institucional
 * Body: { nome, email, telefone?, empresa?, mensagem }
 *
 * Rate limit simples: máx 5 envios por IP / 1h.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { ok, badRequest, serverError } from "@/lib/utils/response";

const schema = z.object({
  nome:     z.string().min(2).max(120).trim(),
  email:    z.string().email().max(120).trim(),
  telefone: z.string().max(20).trim().optional().nullable(),
  empresa:  z.string().max(120).trim().optional().nullable(),
  mensagem: z.string().min(10).max(2000).trim(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "0.0.0.0")
    .split(",")[0].trim();
  const ua = req.headers.get("user-agent") ?? "";

  // Rate limit por IP
  try {
    const recent = await queryOne<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM contatos_institucional
        WHERE ip = $1::inet AND created_at > NOW() - INTERVAL '1 hour'`,
      [ip]
    );
    if (Number(recent?.n ?? "0") >= 5) {
      return badRequest("Você enviou muitos contatos recentemente. Aguarde 1 hora e tente novamente.");
    }
  } catch {}

  try {
    const r = await queryOne<{ id: string }>(
      `INSERT INTO contatos_institucional
         (nome, email, telefone, empresa, mensagem, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7)
       RETURNING id`,
      [body.nome, body.email, body.telefone ?? null, body.empresa ?? null, body.mensagem, ip, ua]
    );

    // Best-effort: dispara email pra equipe (se SMTP estiver configurado)
    try {
      const { enfileirar, smtpAtivo } = await import("@/lib/email/smtp");
      const { getSaasBranding } = await import("@/lib/branding/server");
      if (await smtpAtivo()) {
        const branding = await getSaasBranding();
        if (branding?.email) {
          await enfileirar({
            para:    branding.email,
            evento:  "novo-contato",
            assunto: `📨 Novo contato no site — ${body.nome}`,
            html: `
              <h2>Novo contato</h2>
              <p><strong>Nome:</strong> ${body.nome}</p>
              <p><strong>Email:</strong> ${body.email}</p>
              <p><strong>WhatsApp:</strong> ${body.telefone ?? "—"}</p>
              <p><strong>Empresa:</strong> ${body.empresa ?? "—"}</p>
              <p><strong>Mensagem:</strong></p>
              <blockquote>${body.mensagem.replace(/\n/g, "<br>")}</blockquote>
              <hr>
              <p style="color:#888;font-size:12px">
                IP: ${ip} · UA: ${ua.slice(0, 100)}<br>
                Responder pelo painel: /admin/contatos
              </p>
            `,
          });
        }
      }
    } catch (e) {
      console.warn("[Contato] email notify falhou:", e);
    }

    return ok({ id: r?.id, mensagem: "Recebemos seu contato. Retornaremos em breve." });
  } catch (err) {
    console.error("[Pub/Contato]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
