import { NextRequest } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { queryOne } from "@/lib/db/client";
import { signAccessToken, signRefreshToken, JWTRole } from "@/lib/auth/jwt";
import { criarSessao } from "@/lib/auth/session";
import { checkRateLimitByRequest, AUTH_RATE_LIMIT } from "@/lib/security/rate-limit";
import { logSecurityEvent, incrementLoginFailures, resetLoginFailures } from "@/lib/security/audit";
import { ok, unauthorized, tooManyRequests, badRequest, serverError } from "@/lib/utils/response";
import { getClientIp } from "@/lib/auth/middleware";
import { emManutencao } from "@/lib/security/manutencao";
import { NextResponse } from "next/server";

const loginSchema = z.object({
  email: z.string().email().toLowerCase().max(255),
  senha: z.string().min(1).max(128),
});

interface UsuarioDb {
  id:              string;
  empresa_id:      string | null;
  nome:            string;
  email:           string;
  senha_hash:      string;
  role:            JWTRole;
  ativo:           boolean;
  bloqueado_ate:   Date | null;
  tentativas_login: number;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // Rate limit por IP na rota de login
  const rateLimit = await checkRateLimitByRequest(req, AUTH_RATE_LIMIT);
  if (!rateLimit.success) {
    await logSecurityEvent({ tipo: "rate_limit", ipAddress: ip });
    return tooManyRequests(rateLimit);
  }

  let body: z.infer<typeof loginSchema>;
  try {
    body = loginSchema.parse(await req.json());
  } catch (err: unknown) {
    const msg = err instanceof z.ZodError
      ? err.errors.map(e => e.message).join("; ")
      : "Dados inválidos";
    return badRequest(msg);
  }

  try {
    const usuario = await queryOne<UsuarioDb>(
      `SELECT u.*, e.status as empresa_status
       FROM usuarios u
       LEFT JOIN empresas e ON e.id = u.empresa_id
       WHERE u.email = $1 AND u.deleted_at IS NULL
       LIMIT 1`,
      [body.email]
    );

    // Usuário não encontrado — retorna mensagem genérica (evita enumeração)
    if (!usuario) {
      await logSecurityEvent({ tipo: "login_falha", ipAddress: ip, detalhes: { email: body.email } });
      return unauthorized("E-mail ou senha incorretos");
    }

    // Conta bloqueada por tentativas
    if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date()) {
      const waitMin = Math.ceil(
        (new Date(usuario.bloqueado_ate).getTime() - Date.now()) / 60_000
      );
      return unauthorized(`Conta temporariamente bloqueada. Tente em ${waitMin} minutos`);
    }

    // Conta inativa
    if (!usuario.ativo) {
      return unauthorized("Conta inativa. Entre em contato com o administrador");
    }

    // Verifica senha
    const senhaCorreta = await compare(body.senha, usuario.senha_hash);

    if (!senhaCorreta) {
      const tentativas = await incrementLoginFailures(usuario.id);
      await logSecurityEvent({
        tipo: "login_falha",
        ipAddress: ip,
        usuarioId: usuario.id,
        empresaId: usuario.empresa_id ?? undefined,
        detalhes:  { tentativas },
      });
      return unauthorized("E-mail ou senha incorretos");
    }

    // Modo manutenção: só master pode logar
    if (usuario.role !== "master") {
      const m = await emManutencao();
      if (m.ativo) {
        await logSecurityEvent({
          tipo: "login_falha", ipAddress: ip, usuarioId: usuario.id,
          detalhes: { motivo: "manutencao" },
        });
        return NextResponse.json({
          success: false,
          code: "MANUTENCAO",
          error: m.mensagem || "Sistema em manutenção. Estamos realizando varredura de segurança anti-hacking. Previsão: 30 minutos a 2 horas.",
          data:  { previsao: "30 minutos a 2 horas" },
        }, { status: 503 });
      }
    }

    // Login bem-sucedido
    await resetLoginFailures(usuario.id);

    // Cria refresh token e sessão
    const sessionPayload = {
      sub:       usuario.id,
      sessionId: crypto.randomUUID(),
    };

    const refreshToken = await signRefreshToken(sessionPayload);

    const sessao = await criarSessao({
      usuarioId:    usuario.id,
      refreshToken,
      ipAddress:    ip,
      userAgent:    req.headers.get("user-agent") ?? undefined,
    });

    // Cria access token
    const accessToken = await signAccessToken({
      sub:       usuario.id,
      email:     usuario.email,
      role:      usuario.role,
      empresaId: usuario.empresa_id ?? undefined,
      nome:      usuario.nome,
      sessionId: sessao.id,
    });

    // Atualiza último login
    await queryOne(
      `UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1`,
      [usuario.id]
    );

    await logSecurityEvent({
      tipo:      "login_sucesso",
      ipAddress: ip,
      usuarioId: usuario.id,
      empresaId: usuario.empresa_id ?? undefined,
    });

    return ok({
      access_token:  accessToken,
      refresh_token: refreshToken,
      token_type:    "Bearer",
      expires_in:    900, // 15 minutos
      usuario: {
        id:        usuario.id,
        nome:      usuario.nome,
        email:     usuario.email,
        role:      usuario.role,
        empresaId: usuario.empresa_id,
      },
    });
  } catch (err) {
    console.error("[Auth/Login]", err);
    return serverError();
  }
}
