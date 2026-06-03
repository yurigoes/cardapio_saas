/**
 * GET  /api/admin/anunciantes — lista anunciantes (midia_contas)
 * POST /api/admin/anunciantes — cria anunciante { nome, empresa, email, senha, whatsapp?, cidade? }
 * O anunciante loga no /painel pra enviar arte e ver relatórios.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { hashSenha } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  try {
    await ensureSchema();
    const vals: unknown[] = [];
    let where = "";
    if (q) { vals.push(`%${q}%`); where = `WHERE empresa ILIKE $1 OR nome ILIKE $1 OR email ILIKE $1`; }
    const rows = await db().query(
      `SELECT c.id, c.nome, c.empresa, c.email, c.whatsapp, c.cidade, c.status, c.created_at,
              (SELECT COUNT(*) FROM midia_campanhas mc WHERE mc.conta_id = c.id) AS campanhas
         FROM midia_contas c ${where} ORDER BY c.created_at DESC LIMIT 300`, vals
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, anunciantes: rows });
  } catch (err) {
    console.error("[admin/anunciantes GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const novo = z.object({
  nome:     z.string().min(2).max(120),
  empresa:  z.string().min(1).max(160),
  email:    z.string().email().toLowerCase(),
  senha:    z.string().min(6).max(72),
  whatsapp: z.string().max(30).optional(),
  cidade:   z.string().max(120).optional(),
  afiliado_codigo: z.string().max(20).optional(),
});

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  try {
    await ensureSchema();
    const exists = await db().query(`SELECT 1 FROM midia_contas WHERE email = $1`, [b.email]);
    if (exists.rows.length) return NextResponse.json({ ok: false, error: "e-mail já cadastrado" }, { status: 409 });

    // Resolve afiliado (snapshot da comissão na hora do cadastro)
    let afiliadoId: string | null = null; let afiliadoPct: number | null = null;
    if (b.afiliado_codigo) {
      const af = await db().query<{ id: string; comissao_pct: string; ativo: boolean }>(
        `SELECT id, comissao_pct, ativo FROM midia_afiliados WHERE codigo = $1`, [b.afiliado_codigo.toUpperCase()]
      ).then(r => r.rows[0]);
      if (af?.ativo) { afiliadoId = af.id; afiliadoPct = Number(af.comissao_pct); }
    }

    const hash = await hashSenha(b.senha);
    const id = await db().query<{ id: string }>(
      `INSERT INTO midia_contas (nome, empresa, email, senha_hash, whatsapp, cidade, status, afiliado_id, afiliado_comissao_pct)
       VALUES ($1,$2,$3,$4,$5,$6,'ativo',$7,$8) RETURNING id`,
      [b.nome, b.empresa, b.email, hash, b.whatsapp ?? null, b.cidade ?? null, afiliadoId, afiliadoPct]
    ).then(r => r.rows[0].id);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[admin/anunciantes POST]", err);
    return NextResponse.json({ ok: false, error: "erro ao criar" }, { status: 500 });
  }
}
