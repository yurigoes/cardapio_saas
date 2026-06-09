/**
 * POST /api/admin/login  — login do master/suporte.
 * Body: { email, senha, otp? } → { ok, token, admin }
 *   - Se admin tem 2FA ativado, retorna { ok:false, needs_2fa:true } qd nao mandar otp
 *   - Se OTP errado, retorna { ok:false, error:"código inválido" }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticator } from "otplib";
import { db, ensureSchema } from "@/lib/db";
import { conferirSenha, criarTokenAdmin, type AdminRole } from "@/lib/admin-auth";

const schema = z.object({
  email: z.string().email().toLowerCase(),
  senha: z.string().min(1),
  otp:   z.string().regex(/^\d{6}$/).optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch { return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 }); }

  try {
    await ensureSchema();
    const admin = await db().query<{
      id: string; nome: string; email: string; senha_hash: string; role: AdminRole; ativo: boolean;
      totp_secret: string | null; totp_enabled: boolean;
    }>(
      `SELECT id, nome, email, senha_hash, role, ativo, totp_secret, totp_enabled
         FROM midia_admins WHERE email = $1`,
      [body.email]
    ).then(r => r.rows[0]);

    if (!admin || !admin.ativo || !await conferirSenha(body.senha, admin.senha_hash)) {
      await new Promise(r => setTimeout(r, 600));
      return NextResponse.json({ ok: false, error: "credenciais inválidas" }, { status: 401 });
    }

    // Se admin tem 2FA, exige OTP valido
    if (admin.totp_enabled && admin.totp_secret) {
      if (!body.otp) {
        return NextResponse.json({ ok: false, needs_2fa: true, error: "Informe o código do autenticador (6 dígitos)" }, { status: 401 });
      }
      const valido = authenticator.verify({ token: body.otp, secret: admin.totp_secret });
      if (!valido) {
        await new Promise(r => setTimeout(r, 600));
        return NextResponse.json({ ok: false, needs_2fa: true, error: "Código 2FA inválido. Verifique o relógio do celular." }, { status: 401 });
      }
    }

    const token = await criarTokenAdmin({ sub: admin.id, email: admin.email, nome: admin.nome, role: admin.role });
    return NextResponse.json({ ok: true, token, admin: { nome: admin.nome, email: admin.email, role: admin.role } });
  } catch (err) {
    console.error("[admin/login]", err);
    return NextResponse.json({ ok: false, error: "erro no login" }, { status: 500 });
  }
}
