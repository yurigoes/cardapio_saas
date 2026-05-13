/**
 * POST /api/auth/cadastro-empresa
 *
 * Cadastro self-service: cria empresa + usuário admin inicial em
 * trial de 14 dias. Endpoint público.
 *
 * Body: {
 *   empresa_nome, cnpj?, slug, whatsapp?, email,
 *   admin_nome, admin_senha, plano_id
 * }
 *
 * Devolve: access_token + refresh_token (login automático).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { query, queryOne, transaction } from "@/lib/db/client";
import { ok, badRequest, conflict, serverError } from "@/lib/utils/response";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { criarSessao } from "@/lib/auth/session";
import { getClientIp } from "@/lib/auth/middleware";
import type { PoolClient } from "pg";

const schema = z.object({
  empresa_nome: z.string().min(2).max(255).trim(),
  cnpj:         z.string().max(20).optional(),
  slug:         z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, "Use só letras minúsculas, números e hífen"),
  whatsapp:     z.string().max(20).optional(),
  email:        z.string().email().toLowerCase().max(255),
  admin_nome:   z.string().min(2).max(100).trim(),
  admin_senha:  z.string().min(8).max(128),
  plano_id:     z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) {
    if (err instanceof z.ZodError) {
      return badRequest(err.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "));
    }
    return badRequest("Body inválido");
  }

  // Pega plano (escolhido ou primeiro plano com destaque, ou qualquer plano ativo)
  let plano: { id: string; modulos: string[] | null } | null = null;
  try {
    if (body.plano_id) {
      plano = await queryOne(
        `SELECT id, modulos FROM planos WHERE id = $1 AND ativo = true`,
        [body.plano_id]
      );
    }
    if (!plano) {
      plano = await queryOne(
        `SELECT id, modulos FROM planos WHERE ativo = true
          ORDER BY destaque DESC, preco_mensal ASC LIMIT 1`
      );
    }
  } catch (err) {
    console.error("[Cadastro] erro buscando plano:", err);
    return serverError();
  }
  if (!plano) return serverError("Nenhum plano disponível — contate o suporte");

  // Verifica conflitos antes da transação
  const slugExiste = await queryOne(`SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL`, [body.slug]);
  if (slugExiste) return conflict(`O slug "${body.slug}" já está em uso. Escolha outro.`);

  const emailExiste = await queryOne(
    `SELECT id FROM usuarios WHERE email = $1 AND deleted_at IS NULL`,
    [body.email]
  );
  if (emailExiste) return conflict("E-mail já cadastrado. Faça login.");

  try {
    const result = await transaction(async (client: PoolClient) => {
      // Cria empresa em trial 14 dias
      const trialFim = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const empresaRow = await client.query<{ id: string }>(
        `INSERT INTO empresas
           (nome_fantasia, cnpj, slug, whatsapp, email,
            status, plano_id, modulos_ativos, assinatura_expira_em)
         VALUES ($1, $2, $3, $4, $5, 'teste', $6, $7::jsonb, $8::timestamptz)
         RETURNING id`,
        [
          body.empresa_nome,
          body.cnpj ?? null,
          body.slug,
          body.whatsapp ?? null,
          body.email,
          plano.id,
          JSON.stringify(plano.modulos ?? []),
          trialFim,
        ]
      ).then(r => r.rows[0]);

      // Cria usuário admin via pgcrypto (sem dep de bcryptjs no app)
      const usuarioRow = await client.query<{ id: string }>(
        `INSERT INTO usuarios
           (empresa_id, nome, email, senha_hash, role, ativo, tentativas_login)
         VALUES ($1, $2, $3, crypt($4, gen_salt('bf', 12)), 'admin', true, 0)
         RETURNING id`,
        [empresaRow.id, body.admin_nome, body.email, body.admin_senha]
      ).then(r => r.rows[0]);

      return { empresa_id: empresaRow.id, usuario_id: usuarioRow.id };
    });

    // Login automático
    const ip = getClientIp(req);
    const sessionPayload = { sub: result.usuario_id, sessionId: crypto.randomUUID() };
    const refreshToken = await signRefreshToken(sessionPayload);
    const sessao = await criarSessao({
      usuarioId: result.usuario_id,
      refreshToken,
      ipAddress: ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    const accessToken = await signAccessToken({
      sub:       result.usuario_id,
      email:     body.email,
      role:      "admin",
      empresaId: result.empresa_id,
      nome:      body.admin_nome,
      sessionId: sessao.id,
    });

    return ok({
      empresa_id:    result.empresa_id,
      access_token:  accessToken,
      refresh_token: refreshToken,
      token_type:    "Bearer",
      expires_in:    900,
      mensagem:      "Conta criada! Você tem 14 dias grátis pra testar.",
    });
  } catch (err) {
    console.error("[Cadastro/Empresa]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
