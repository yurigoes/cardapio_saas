/**
 * TOTP (RFC 6238) helper — usa otplib + qrcode pra setup 2FA.
 *
 * - Secret: 32 chars base32, cifrado AES-256-GCM antes de persistir
 * - Window: aceita códigos do bloco anterior/atual/próximo (drift de até 30s)
 * - Recovery codes: 8 códigos de 10 chars (alfanumérico), hash bcrypt
 */
import { authenticator } from "otplib";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { encrypt, decryptIfNeeded } from "@/lib/security/encrypt";
import { query, queryOne } from "@/lib/db/client";

// Config global do authenticator: 6 dígitos, 30s, window 1 (±30s tolerância)
authenticator.options = {
  digits: 6,
  step:   30,
  window: 1,
};

/** Gera novo secret base32 (não persiste) */
export function gerarSecret(): string {
  return authenticator.generateSecret(20); // 32 chars base32
}

/** URL otpauth:// pra QR code */
export function otpauthUrl(opts: {
  secret:    string;
  email:     string;
  issuer:    string;
}): string {
  return authenticator.keyuri(opts.email, opts.issuer, opts.secret);
}

/** Gera Data URL PNG do QR code (pode usar direto em <img src=...>) */
export async function gerarQrCodeDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, { width: 240, margin: 1, errorCorrectionLevel: "M" });
}

/** Verifica código TOTP de 6 dígitos contra secret */
export function verificarCodigo(secret: string, codigo: string): boolean {
  if (!secret || !codigo || codigo.length !== 6) return false;
  try {
    return authenticator.verify({ token: codigo, secret });
  } catch {
    return false;
  }
}

/** Cifra secret pra persistir */
export function cifrarSecret(secret: string): string {
  return encrypt(secret);
}

/** Descifra secret persistido */
export function decifrarSecret(cifrado: string): string | null {
  return decryptIfNeeded(cifrado);
}

// ─── Recovery codes ──────────────────────────────────────────────────────────

/** Gera 8 códigos de recuperação alfanuméricos (formato XXXX-XXXX) */
export function gerarRecoveryCodes(qtd = 8): string[] {
  const codes: string[] = [];
  const charset = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // sem confusão (0/O, 1/I/L)
  for (let i = 0; i < qtd; i++) {
    const bytes = randomBytes(8);
    let s = "";
    for (let j = 0; j < 8; j++) {
      s += charset[bytes[j] % charset.length];
    }
    codes.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return codes;
}

/** Persiste recovery codes (apaga antigos primeiro) */
export async function salvarRecoveryCodes(
  usuarioId: string,
  codes: string[]
): Promise<void> {
  await query(`DELETE FROM totp_recovery_codes WHERE usuario_id = $1`, [usuarioId]);
  for (const c of codes) {
    const hash = await bcrypt.hash(c.replace("-", ""), 10);
    await query(
      `INSERT INTO totp_recovery_codes (usuario_id, codigo_hash) VALUES ($1, $2)`,
      [usuarioId, hash]
    );
  }
}

/** Tenta usar um recovery code. Retorna true se usou (e marca como usado) */
export async function consumirRecoveryCode(
  usuarioId: string,
  codigo:    string,
  ipOrigem?: string,
): Promise<boolean> {
  const limpo = codigo.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (limpo.length !== 8) return false;

  const codes = await query<{ id: string; codigo_hash: string }>(
    `SELECT id, codigo_hash FROM totp_recovery_codes
      WHERE usuario_id = $1 AND usado_em IS NULL`,
    [usuarioId]
  );
  for (const c of codes) {
    if (await bcrypt.compare(limpo, c.codigo_hash)) {
      await query(
        `UPDATE totp_recovery_codes SET usado_em = NOW(), ip_uso = $2 WHERE id = $1`,
        [c.id, ipOrigem ?? null]
      );
      return true;
    }
  }
  return false;
}

/** Conta recovery codes não-usados restantes */
export async function recoveryCodesRestantes(usuarioId: string): Promise<number> {
  const r = await queryOne<{ qtd: string }>(
    `SELECT COUNT(*) AS qtd FROM totp_recovery_codes
      WHERE usuario_id = $1 AND usado_em IS NULL`,
    [usuarioId]
  );
  return Number(r?.qtd ?? 0);
}

/** Verifica e consome código (TOTP ou recovery) — uso central pelo login */
export async function verificarOuConsumir(
  usuarioId: string,
  secretCifrado: string | null,
  codigo: string,
  ipOrigem?: string,
): Promise<{ ok: boolean; via: "totp" | "recovery" | null }> {
  if (!secretCifrado) return { ok: false, via: null };

  // Tenta TOTP primeiro (mais comum)
  if (codigo.length === 6 && /^\d+$/.test(codigo)) {
    const secret = decifrarSecret(secretCifrado);
    if (secret && verificarCodigo(secret, codigo)) {
      await query(
        `UPDATE usuarios SET totp_ultimo_uso = NOW() WHERE id = $1`, [usuarioId]
      ).catch(() => {});
      return { ok: true, via: "totp" };
    }
  }

  // Tenta recovery code
  if (await consumirRecoveryCode(usuarioId, codigo, ipOrigem)) {
    return { ok: true, via: "recovery" };
  }

  return { ok: false, via: null };
}
