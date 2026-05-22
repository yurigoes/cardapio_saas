/**
 * GET  /api/painel/chamados        — lista chamados do anunciante (com última msg)
 * POST /api/painel/chamados        — abre chamado { assunto, mensagem }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    await ensureSchema();
    const rows = await db().query(
      `SELECT ch.id, ch.assunto, ch.status, ch.created_at, ch.updated_at,
              (SELECT mensagem FROM midia_chamado_msgs m WHERE m.chamado_id = ch.id ORDER BY created_at DESC LIMIT 1) AS ultima_msg
         FROM midia_chamados ch WHERE ch.conta_id = $1 ORDER BY ch.updated_at DESC`,
      [auth.sub]
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, chamados: rows });
  } catch (err) {
    console.error("[painel/chamados GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const novo = z.object({ assunto: z.string().min(2).max(160), mensagem: z.string().min(2).max(4000) });

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  try {
    await ensureSchema();
    const p = db();
    const id = await p.query<{ id: string }>(
      `INSERT INTO midia_chamados (conta_id, assunto, status) VALUES ($1,$2,'aberto') RETURNING id`,
      [auth.sub, parsed.data.assunto]
    ).then(r => r.rows[0].id);
    await p.query(`INSERT INTO midia_chamado_msgs (chamado_id, autor, mensagem) VALUES ($1,'cliente',$2)`, [id, parsed.data.mensagem]);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[painel/chamados POST]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
