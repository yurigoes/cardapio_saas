/**
 * Gestão de operadores da conta do anunciante (multi-usuário).
 * GET   /api/painel/usuarios — lista operadores
 * POST  /api/painel/usuarios — cria { nome, email, senha }
 * PATCH /api/painel/usuarios — { id, ativo?|senha? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticar, hashSenha } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const rows = await db().query(
    `SELECT id, nome, email, role, ativo, created_at FROM midia_conta_usuarios WHERE conta_id = $1 ORDER BY created_at`,
    [auth.sub]
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, usuarios: rows });
}

const novo = z.object({ nome: z.string().min(2).max(120), email: z.string().email().toLowerCase(), senha: z.string().min(6).max(72), role: z.enum(["operador", "gerente"]).default("operador") });

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  try {
    await ensureSchema();
    const hash = await hashSenha(parsed.data.senha);
    await db().query(
      `INSERT INTO midia_conta_usuarios (conta_id, nome, email, senha_hash, role) VALUES ($1,$2,$3,$4,$5)`,
      [auth.sub, parsed.data.nome, parsed.data.email, hash, parsed.data.role]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error && err.message.includes("duplicate") ? "e-mail já em uso" : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

const patch = z.object({ id: z.string().uuid(), ativo: z.boolean().optional(), senha: z.string().min(6).max(72).optional(), remover: z.boolean().optional() });

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  if (b.remover) {
    await db().query(`DELETE FROM midia_conta_usuarios WHERE id = $1 AND conta_id = $2`, [b.id, auth.sub]);
    return NextResponse.json({ ok: true });
  }
  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  if (b.ativo !== undefined) add("ativo", b.ativo);
  if (b.senha) add("senha_hash", await hashSenha(b.senha));
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });
  vals.push(b.id, auth.sub);
  await db().query(`UPDATE midia_conta_usuarios SET ${sets.join(", ")} WHERE id = $${vals.length - 1} AND conta_id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}
