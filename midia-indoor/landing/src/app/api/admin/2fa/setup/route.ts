/**
 * POST /api/admin/2fa/setup - inicia enrollment 2FA
 *   Gera secret, salva no admin (ainda nao ativa), retorna otpauth URI pra QR.
 * POST /api/admin/2fa/setup com { token } - confirma + ativa
 * DELETE /api/admin/2fa/setup - desativa 2FA do admin logado
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticator } from "otplib";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await autenticarAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();

  const body = await req.json().catch(() => ({}));

  // 2a chamada: { token } - confirma e ativa
  if (body.token) {
    const r = await db().query<{ totp_secret: string | null }>(
      `SELECT totp_secret FROM midia_admins WHERE id = $1`, [admin.sub]
    );
    const secret = r.rows[0]?.totp_secret;
    if (!secret) return NextResponse.json({ ok: false, error: "Inicie o setup primeiro" }, { status: 400 });

    const valido = authenticator.verify({ token: String(body.token), secret });
    if (!valido) return NextResponse.json({ ok: false, error: "Código inválido. Confira o relógio do celular." }, { status: 400 });

    await db().query(`UPDATE midia_admins SET totp_enabled = true WHERE id = $1`, [admin.sub]);
    return NextResponse.json({ ok: true, mensagem: "2FA ativado!" });
  }

  // 1a chamada: gera secret novo
  const secret = authenticator.generateSecret();
  await db().query(
    `UPDATE midia_admins SET totp_secret = $1, totp_enabled = false WHERE id = $2`,
    [secret, admin.sub]
  );

  const r = await db().query<{ email: string }>(`SELECT email FROM midia_admins WHERE id = $1`, [admin.sub]);
  const email = r.rows[0]?.email ?? "admin";
  const issuer = "Three Digital";
  const otpauthUri = authenticator.keyuri(email, issuer, secret);

  return NextResponse.json({
    ok: true,
    secret,                // mostra ao usuário (pra digitar manual)
    otpauth_uri: otpauthUri, // pra gerar QR code no client
    issuer,
    email,
  });
}

export async function DELETE(req: NextRequest) {
  const admin = await autenticarAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  await db().query(
    `UPDATE midia_admins SET totp_enabled = false, totp_secret = NULL WHERE id = $1`,
    [admin.sub]
  );
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const admin = await autenticarAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const r = await db().query<{ totp_enabled: boolean }>(
    `SELECT totp_enabled FROM midia_admins WHERE id = $1`, [admin.sub]
  );
  return NextResponse.json({ ok: true, ativo: r.rows[0]?.totp_enabled ?? false });
}
