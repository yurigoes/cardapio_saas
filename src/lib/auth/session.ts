import { query, queryOne } from "@/lib/db/client";
import { redis, redisDel } from "@/lib/db/redis";

const SESSION_CACHE_TTL = 300; // 5 minutos

export interface Sessao {
  id:           string;
  usuario_id:   string;
  refresh_token: string;
  ip_address:   string | null;
  user_agent:   string | null;
  expires_at:   Date;
  revogado_em:  Date | null;
}

export async function criarSessao(params: {
  usuarioId:    string;
  refreshToken: string;
  ipAddress?:   string;
  userAgent?:   string;
}): Promise<Sessao> {
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
  const days      = parseInt(expiresIn.replace("d", "")) || 7;

  const rows = await query<Sessao>(
    `INSERT INTO sessoes (usuario_id, refresh_token, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3::inet, $4, NOW() + INTERVAL '${days} days')
     RETURNING *`,
    [params.usuarioId, params.refreshToken, params.ipAddress ?? null, params.userAgent ?? null]
  );

  return rows[0];
}

export async function buscarSessaoPorToken(refreshToken: string): Promise<Sessao | null> {
  return queryOne<Sessao>(
    `SELECT * FROM sessoes
     WHERE refresh_token = $1
       AND revogado_em IS NULL
       AND expires_at > NOW()`,
    [refreshToken]
  );
}

export async function revogarSessao(sessionId: string): Promise<void> {
  await query(
    `UPDATE sessoes SET revogado_em = NOW() WHERE id = $1`,
    [sessionId]
  );
  await redisDel(`session:${sessionId}`);
}

export async function revogarTodasSessoes(usuarioId: string): Promise<void> {
  await query(
    `UPDATE sessoes SET revogado_em = NOW()
     WHERE usuario_id = $1 AND revogado_em IS NULL`,
    [usuarioId]
  );

  // Limpa cache de todas as sessões do usuário
  const keys = await redis.keys(`session:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export async function limparSessoesExpiradas(): Promise<void> {
  await query(
    `DELETE FROM sessoes WHERE expires_at < NOW() - INTERVAL '1 day'`
  );
}

// Verifica se sessão foi revogada (cache Redis + fallback DB)
export async function isSessaoValida(sessionId: string): Promise<boolean> {
  const cacheKey = `session:${sessionId}`;
  const cached   = await redis.get(cacheKey);

  if (cached === "revogada") return false;

  const sessao = await queryOne<{ revogado_em: Date | null; expires_at: Date }>(
    `SELECT revogado_em, expires_at FROM sessoes WHERE id = $1`,
    [sessionId]
  );

  if (!sessao || sessao.revogado_em || sessao.expires_at < new Date()) {
    await redis.set(cacheKey, "revogada", "EX", SESSION_CACHE_TTL);
    return false;
  }

  return true;
}
