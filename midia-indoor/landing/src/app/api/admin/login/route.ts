/**
 * POST /api/admin/login  — login do master/suporte.
 * Body: { email, senha } → { ok, token, admin }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { conferirSenha, criarTokenAdmin, type AdminRole } from "@/lib/admin-auth";

const schema = z.object({ email: z.string().email().toLowerCase(), senha: z.string().min(1) });

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch { return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 }); }

  try {
    await ensureSchema();
    const admin = await db().query<{
      id: string; nome: string; email: string; senha_hash: string; role: AdminRole; ativo: boolean;
    }>(
      `SELECT id, nome, email, senha_hash, role, ativo FROM midia_admins WHERE email = $1`,
      [body.email]
    ).then(r => r.rows[0]);

    if (!admin || !admin.ativo || !await conferirSenha(body.senha, admin.senha_hash)) {
      await new Promise(r => setTimeout(r, 600));
      return NextResponse.json({ ok: false, error: "credenciais inválidas" }, { status: 401 });
    }

    const token = await criarTokenAdmin({ sub: admin.id, email: admin.email, nome: admin.nome, role: admin.role });
    return NextResponse.json({ ok: true, token, admin: { nome: admin.nome, email: admin.email, role: admin.role } });
  } catch (err) {
    console.error("[admin/login]", err);
    return NextResponse.json({ ok: false, error: "erro no login" }, { status: 500 });
  }
}
