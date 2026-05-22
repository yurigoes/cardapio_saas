/**
 * GET  /api/admin/chamados        — lista todos (com empresa)
 * GET  /api/admin/chamados?id=    — mensagens de um chamado
 * POST /api/admin/chamados        — responde { chamado_id, mensagem, fechar? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";
import { enviarRespostaChamado } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const p = db();
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const msgs = await p.query(
      `SELECT autor, mensagem, created_at FROM midia_chamado_msgs WHERE chamado_id = $1 ORDER BY created_at`, [id]
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, mensagens: msgs });
  }

  const rows = await p.query(
    `SELECT ch.id, ch.assunto, ch.status, ch.created_at, ch.updated_at, ct.empresa, ct.nome AS contato,
            (SELECT mensagem FROM midia_chamado_msgs m WHERE m.chamado_id = ch.id ORDER BY created_at DESC LIMIT 1) AS ultima_msg
       FROM midia_chamados ch JOIN midia_contas ct ON ct.id = ch.conta_id
      ORDER BY (ch.status='aberto') DESC, ch.updated_at DESC`
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, chamados: rows });
}

const resp = z.object({ chamado_id: z.string().uuid(), mensagem: z.string().min(1).max(4000), fechar: z.boolean().optional() });

export async function POST(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const parsed = resp.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  try {
    await ensureSchema();
    const p = db();
    await p.query(`INSERT INTO midia_chamado_msgs (chamado_id, autor, mensagem) VALUES ($1,'suporte',$2)`, [b.chamado_id, b.mensagem]);
    await p.query(`UPDATE midia_chamados SET status=$1, updated_at=NOW() WHERE id=$2`, [b.fechar ? "fechado" : "respondido", b.chamado_id]);

    // Notifica o anunciante por e-mail (best-effort)
    try {
      const dados = await p.query<{ nome: string; email: string; assunto: string }>(
        `SELECT ct.nome, ct.email, ch.assunto
           FROM midia_chamados ch JOIN midia_contas ct ON ct.id = ch.conta_id WHERE ch.id = $1`,
        [b.chamado_id]
      ).then(r => r.rows[0]);
      if (dados?.email) await enviarRespostaChamado({ nome: dados.nome, email: dados.email, assunto: dados.assunto, mensagem: b.mensagem });
    } catch (e) { console.warn("[chamados] e-mail não enviado:", (e as Error).message); }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/chamados POST]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
