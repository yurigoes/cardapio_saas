/**
 * POST /api/auth/login
 * Body: { email, senha } → { ok, token, conta }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { conferirSenha, criarToken } from "@/lib/auth";

const schema = z.object({
  email: z.string().email().toLowerCase(),
  senha: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch { return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 }); }

  try {
    await ensureSchema();
    const p = db();
    const conta = await p.query<{
      id: string; empresa: string; email: string; senha_hash: string; status: string;
    }>(
      `SELECT id, empresa, email, senha_hash, status FROM midia_contas WHERE email = $1`,
      [body.email]
    ).then(r => r.rows[0]);

    if (!conta || !await conferirSenha(body.senha, conta.senha_hash)) {
      await new Promise(r => setTimeout(r, 600)); // anti brute-force leve
      return NextResponse.json({ ok: false, error: "e-mail ou senha incorretos" }, { status: 401 });
    }

    const token = await criarToken({ sub: conta.id, email: conta.email, empresa: conta.empresa });
    return NextResponse.json({
      ok: true, token,
      conta: { id: conta.id, empresa: conta.empresa, email: conta.email, status: conta.status },
    });
  } catch (err) {
    console.error("[login]", err);
    return NextResponse.json({ ok: false, error: "erro no login" }, { status: 500 });
  }
}
