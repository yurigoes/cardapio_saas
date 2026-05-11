import { NextRequest } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db/client";
import { verifyRefreshToken, signAccessToken, signRefreshToken, JWTRole } from "@/lib/auth/jwt";
import { buscarSessaoPorToken, criarSessao, revogarSessao } from "@/lib/auth/session";
import { ok, unauthorized, badRequest, serverError } from "@/lib/utils/response";
import { getClientIp } from "@/lib/auth/middleware";

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  let body: z.infer<typeof refreshSchema>;
  try {
    body = refreshSchema.parse(await req.json());
  } catch {
    return badRequest("refresh_token obrigatório");
  }

  try {
    // 1. Verifica assinatura do refresh token
    let tokenPayload: { sub: string; sessionId: string };
    try {
      tokenPayload = await verifyRefreshToken(body.refresh_token);
    } catch {
      return unauthorized("Refresh token inválido ou expirado");
    }

    // 2. Busca sessão no banco
    const sessao = await buscarSessaoPorToken(body.refresh_token);
    if (!sessao || sessao.id !== tokenPayload.sessionId) {
      return unauthorized("Sessão não encontrada ou expirada");
    }

    // 3. Busca dados do usuário
    const usuario = await queryOne<{
      id: string;
      nome: string;
      email: string;
      role: JWTRole;
      empresa_id: string | null;
      ativo: boolean;
    }>(
      `SELECT id, nome, email, role, empresa_id, ativo
       FROM usuarios WHERE id = $1 AND deleted_at IS NULL`,
      [tokenPayload.sub]
    );

    if (!usuario || !usuario.ativo) {
      await revogarSessao(sessao.id);
      return unauthorized("Usuário inativo ou não encontrado");
    }

    // 4. Rotação de tokens — revoga sessão atual, cria nova
    await revogarSessao(sessao.id);

    const newSessionPayload = {
      sub:       usuario.id,
      sessionId: crypto.randomUUID(),
    };

    const newRefreshToken = await signRefreshToken(newSessionPayload);

    const novaSessao = await criarSessao({
      usuarioId:    usuario.id,
      refreshToken: newRefreshToken,
      ipAddress:    ip,
      userAgent:    req.headers.get("user-agent") ?? undefined,
    });

    const newAccessToken = await signAccessToken({
      sub:       usuario.id,
      email:     usuario.email,
      role:      usuario.role,
      empresaId: usuario.empresa_id ?? undefined,
      nome:      usuario.nome,
      sessionId: novaSessao.id,
    });

    return ok({
      access_token:  newAccessToken,
      refresh_token: newRefreshToken,
      token_type:    "Bearer",
      expires_in:    900,
    });
  } catch (err) {
    console.error("[Auth/Refresh]", err);
    return serverError();
  }
}
