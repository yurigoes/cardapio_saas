/**
 * GET   /api/admin/usuarios — lista admins (master/suporte)
 * POST  /api/admin/usuarios — cria admin { nome, email, senha, role }
 * PATCH /api/admin/usuarios — { id, ativo?|role?|senha? }
 * Só master gerencia usuários.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster, hashSenha } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  try {
    await ensureSchema();
    const rows = await db().query(
      `SELECT id, nome, email, role, ativo, created_at FROM midia_admins ORDER BY created_at`
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, usuarios: rows });
  } catch (err) {
    console.error("[admin/usuarios GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const novo = z.object({
  nome:  z.string().min(2).max(120),
  email: z.string().email().toLowerCase(),
  senha: z.string().min(6).max(72),
  role:  z.enum(["master", "suporte"]).default("suporte"),
});

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });

  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;

  try {
    await ensureSchema();
    const hash = await hashSenha(b.senha);
    await db().query(
      `INSERT INTO midia_admins (nome, email, senha_hash, role) VALUES ($1,$2,$3,$4)`,
      [b.nome, b.email, hash, b.role]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error && err.message.includes("duplicate") ? "e-mail já cadastrado" : "erro ao criar";
    console.error("[admin/usuarios POST]", err);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

const patch = z.object({
  id:    z.string().uuid(),
  ativo: z.boolean().optional(),
  role:  z.enum(["master", "suporte"]).optional(),
  senha: z.string().min(6).max(72).optional(),
});

export async function PATCH(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });

  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;

  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  if (b.ativo !== undefined) add("ativo", b.ativo);
  if (b.role  !== undefined) add("role", b.role);
  if (b.senha !== undefined) add("senha_hash", await hashSenha(b.senha));
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });

  try {
    await ensureSchema();
    vals.push(b.id);
    await db().query(`UPDATE midia_admins SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/usuarios PATCH]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
