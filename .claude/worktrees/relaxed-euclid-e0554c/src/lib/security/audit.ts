import { query } from "@/lib/db/client";
import { TokenPayload } from "@/lib/auth/jwt";

interface AuditParams {
  acao:             string;
  recurso?:         string;
  recursoId?:       string;
  dadosAnteriores?: unknown;
  dadosNovos?:      unknown;
  ipAddress?:       string;
  userAgent?:       string;
  duracaoMs?:       number;
  usuario?:         Pick<TokenPayload, "sub" | "empresaId">;
}

export async function auditLog(params: AuditParams): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_log
         (empresa_id, usuario_id, acao, recurso, recurso_id,
          dados_anteriores, dados_novos, ip_address, user_agent, duracao_ms)
       VALUES ($1, $2, $3, $4, $5::uuid, $6, $7, $8::inet, $9, $10)`,
      [
        params.usuario?.empresaId ?? null,
        params.usuario?.sub       ?? null,
        params.acao,
        params.recurso            ?? null,
        params.recursoId          ?? null,
        params.dadosAnteriores ? JSON.stringify(params.dadosAnteriores) : null,
        params.dadosNovos      ? JSON.stringify(params.dadosNovos)      : null,
        params.ipAddress          ?? null,
        params.userAgent          ?? null,
        params.duracaoMs          ?? null,
      ]
    );
  } catch (err) {
    console.error("[Audit] Falha ao registrar auditoria:", err);
  }
}

interface SecurityEventParams {
  tipo:        string;
  ipAddress?:  string;
  usuarioId?:  string;
  empresaId?:  string;
  detalhes?:   Record<string, unknown>;
}

export async function logSecurityEvent(params: SecurityEventParams): Promise<void> {
  try {
    await query(
      `INSERT INTO security_events (tipo, ip_address, usuario_id, empresa_id, detalhes)
       VALUES ($1, $2::inet, $3::uuid, $4::uuid, $5)`,
      [
        params.tipo,
        params.ipAddress ?? null,
        params.usuarioId ?? null,
        params.empresaId ?? null,
        JSON.stringify(params.detalhes ?? {}),
      ]
    );
  } catch (err) {
    console.error("[Security] Falha ao registrar evento:", err);
  }
}

export async function incrementLoginFailures(usuarioId: string): Promise<number> {
  const rows = await query<{ tentativas_login: number; bloqueado_ate: Date | null }>(
    `UPDATE usuarios
     SET tentativas_login = tentativas_login + 1,
         bloqueado_ate = CASE
           WHEN tentativas_login + 1 >= 10 THEN NOW() + INTERVAL '30 minutes'
           WHEN tentativas_login + 1 >= 5  THEN NOW() + INTERVAL '5 minutes'
           ELSE bloqueado_ate
         END
     WHERE id = $1
     RETURNING tentativas_login, bloqueado_ate`,
    [usuarioId]
  );

  return rows[0]?.tentativas_login ?? 0;
}

export async function resetLoginFailures(usuarioId: string): Promise<void> {
  await query(
    `UPDATE usuarios SET tentativas_login = 0, bloqueado_ate = NULL WHERE id = $1`,
    [usuarioId]
  );
}
