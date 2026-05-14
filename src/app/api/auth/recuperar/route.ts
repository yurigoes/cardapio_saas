/**
 * POST /api/auth/recuperar
 * Body: { identificador: string, canal?: "email" | "whatsapp" | "auto" }
 *
 * Inicia recuperação de senha. Identificador pode ser email ou telefone.
 * Canal controla onde mandar o código:
 *   - "email"    : SMTP (precisa configurado)
 *   - "whatsapp" : Evolution (precisa configurado)
 *   - "auto"     : tenta o que combinar com o identificador
 *
 * Sempre retorna sucesso (não revela se usuário existe — anti-enumeration).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { ok, badRequest, serverError, tooManyRequests } from "@/lib/utils/response";
import { getClientIp } from "@/lib/auth/middleware";
import { checkRateLimitByRequest, RECUPERAR_RATE_LIMIT } from "@/lib/security/rate-limit";
import bcrypt from "bcryptjs";
import { enfileirar as enfileirarEmail, smtpAtivo } from "@/lib/email/smtp";
import { notificarEvolution } from "@/lib/notify/evolution";

const schema = z.object({
  identificador: z.string().min(3).max(255),
  canal:         z.enum(["email", "whatsapp", "auto"]).default("auto"),
});

function gerarCodigo(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function ehEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function POST(req: NextRequest) {
  // Rate limit por IP — anti-spam de envio (5 por 5min default)
  const rl = await checkRateLimitByRequest(req, RECUPERAR_RATE_LIMIT);
  if (!rl.success) return tooManyRequests(rl);

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const ident = body.identificador.trim();
  const ehMail = ehEmail(ident);

  // Busca usuário por email OU telefone
  const usuario = await queryOne<{
    id: string; nome: string; email: string | null; telefone: string | null;
    empresa_id: string | null;
  }>(
    ehMail
      ? `SELECT id, nome, email, telefone, empresa_id
           FROM usuarios WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL`
      : `SELECT id, nome, email, telefone, empresa_id
           FROM usuarios WHERE telefone = $1 AND deleted_at IS NULL`,
    [ident]
  ).catch(() => null);

  // Anti-enumeration: sempre devolve sucesso, mesmo se não existe
  const respostaPadrao = ok({
    enviado: true,
    canal:   body.canal,
    mensagem: "Se o identificador estiver cadastrado, você receberá um código.",
  });

  if (!usuario) return respostaPadrao;

  // Decide canal final
  let canalFinal: "email" | "whatsapp" = body.canal === "auto"
    ? (ehMail ? "email" : "whatsapp")
    : body.canal;

  // Se canal escolhido não tem destino válido, tenta o outro
  if (canalFinal === "email" && !usuario.email) {
    canalFinal = "whatsapp";
  } else if (canalFinal === "whatsapp" && !usuario.telefone) {
    canalFinal = "email";
  }

  const destino = canalFinal === "email" ? usuario.email : usuario.telefone;
  if (!destino) return respostaPadrao;

  // Gera código + salva (hash) com TTL 15min
  const codigo     = gerarCodigo();
  const codigoHash = await bcrypt.hash(codigo, 10);
  const expiresAt  = new Date(Date.now() + 15 * 60 * 1000);

  try {
    await query(
      `INSERT INTO password_resets (usuario_id, codigo, canal, destino, expires_at, ip_origem)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [usuario.id, codigoHash, canalFinal, destino, expiresAt, getClientIp(req)]
    );

    // Envia
    if (canalFinal === "email") {
      if (!await smtpAtivo()) {
        console.warn("[Recuperar] SMTP não configurado, fallback whatsapp");
        if (usuario.telefone && usuario.empresa_id) {
          await notificarEvolution(usuario.empresa_id, "novo_cliente", {
            telefone:    usuario.telefone,
            clienteNome: `Código de recuperação: ${codigo} (válido por 15 min)`,
          }).catch(() => {});
        }
      } else {
        await enfileirarEmail({
          para:   destino,
          evento: "reset_senha",
          vars: {
            usuario_nome: usuario.nome,
            codigo,
          },
          contexto: { usuario_id: usuario.id, tipo: "reset_senha" },
        });
      }
    } else if (canalFinal === "whatsapp" && usuario.empresa_id) {
      // Reusa Evolution API com mensagem direta (sem template)
      await notificarEvolution(usuario.empresa_id, "novo_cliente", {
        telefone:    destino,
        clienteNome: `Código de recuperação: ${codigo} (válido por 15 min)`,
      }).catch(() => {});
    }

    return ok({
      enviado: true,
      canal:   canalFinal,
      destino_mascarado: canalFinal === "email"
        ? destino.replace(/(.{2}).*(@.*)/, "$1***$2")
        : destino.slice(0, 4) + "***" + destino.slice(-2),
      mensagem: `Código enviado por ${canalFinal === "email" ? "e-mail" : "WhatsApp"}.`,
    });
  } catch (err) {
    console.error("[Recuperar]", err);
    return serverError();
  }
}
