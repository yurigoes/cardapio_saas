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
import { verificarOuConsumir } from "@/lib/auth/totp";
import { NextResponse } from "next/server";

const loginSchema = z.object({
  email:    z.string().email().toLowerCase().max(255),
  senha:    z.string().min(1).max(128),
  codigo_2fa: z.string().min(6).max(20).optional(),  // TOTP 6 dígitos OU recovery XXXX-XXXX
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
  totp_enabled:    boolean;
  totp_secret:     string | null;
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

    // ── 2FA TOTP — se ativo, exige código antes de logar ──────────────────
    if (usuario.totp_enabled) {
      if (!body.codigo_2fa) {
        return NextResponse.json({
          success: false,
          code:    "2FA_REQUIRED",
          error:   "Esta conta tem 2FA ativo. Informe o código do app authenticator.",
          data:    { requer_2fa: true },
        }, { status: 401 });
      }
      const r = await verificarOuConsumir(
        usuario.id, usuario.totp_secret, body.codigo_2fa.trim(), ip
      );
      if (!r.ok) {
        await logSecurityEvent({
          tipo:      "login_falha",
          ipAddress: ip, usuarioId: usuario.id,
          detalhes:  { motivo: "2fa_invalido" },
        });
        return NextResponse.json({
          success: false,
          code:    "2FA_INVALID",
          error:   "Código 2FA inválido ou expirado",
          data:    { requer_2fa: true },
        }, { status: 401 });
      }
      // Avisa quando recovery code foi usado (UI pode alertar)
      if (r.via === "recovery") {
        // Apenas log; UI vê via /api/auth/2fa/status que codes_restantes diminui
        console.info(`[Auth] usuario=${usuario.id} usou recovery code`);
      }
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
