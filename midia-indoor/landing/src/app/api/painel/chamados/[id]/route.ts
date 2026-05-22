/**
 * GET  /api/painel/chamados/[id] — mensagens do chamado (do próprio anunciante)
 * POST /api/painel/chamados/[id] — adiciona mensagem { mensagem }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function dono(chamadoId: string, contaId: string): Promise<boolean> {
  await ensureSchema();
  const r = await db().query(`SELECT 1 FROM midia_chamados WHERE id = $1 AND conta_id = $2`, [chamadoId, contaId]);
  return r.rows.length > 0;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  if (!await dono(params.id, auth.sub)) return NextResponse.json({ ok: false, error: "não encontrado" }, { status: 404 });
  const msgs = await db().query(
    `SELECT autor, mensagem, created_at FROM midia_chamado_msgs WHERE chamado_id = $1 ORDER BY created_at`, [params.id]
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, mensagens: msgs });
}

const msg = z.object({ mensagem: z.string().min(1).max(4000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  if (!await dono(params.id, auth.sub)) return NextResponse.json({ ok: false, error: "não encontrado" }, { status: 404 });
  const parsed = msg.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "mensagem vazia" }, { status: 400 });
  const p = db();
  await p.query(`INSERT INTO midia_chamado_msgs (chamado_id, autor, mensagem) VALUES ($1,'cliente',$2)`, [params.id, parsed.data.mensagem]);
  await p.query(`UPDATE midia_chamados SET status='aberto', updated_at=NOW() WHERE id=$1`, [params.id]);
  return NextResponse.json({ ok: true });
}
