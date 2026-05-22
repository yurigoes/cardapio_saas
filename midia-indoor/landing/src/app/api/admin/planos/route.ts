/**
 * GET   /api/admin/planos      — lista todos (inclui inativos)
 * POST  /api/admin/planos      — cria { id, nome, preco, telas_label, destaque, recursos[], ordem }
 * (PATCH/DELETE por id em ./[id]/route.ts)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster, autenticarAdmin } from "@/lib/admin-auth";
import { listarTodosPlanos } from "@/lib/planos-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, planos: await listarTodosPlanos() });
  } catch (err) {
    console.error("[admin/planos GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const schema = z.object({
  id:          z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/, "id: só minúsculas, números, - e _"),
  nome:        z.string().min(1).max(80),
  preco:       z.coerce.number().min(0),
  telas_label: z.string().max(80).default(""),
  destaque:    z.boolean().default(false),
  recursos:    z.array(z.string()).default([]),
  ordem:       z.coerce.number().int().default(0),
});

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;

  try {
    await ensureSchema();
    await db().query(
      `INSERT INTO midia_planos (id, nome, preco, telas_label, destaque, recursos, ativo, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7)`,
      [b.id, b.nome, b.preco, b.telas_label, b.destaque, JSON.stringify(b.recursos), b.ordem]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error && err.message.includes("duplicate") ? "já existe um plano com esse id" : "erro ao criar";
    console.error("[admin/planos POST]", err);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
