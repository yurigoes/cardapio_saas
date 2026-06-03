/**
 * GET   /api/admin/cobrancas       — lista cobranças recorrentes + última fatura
 * POST  /api/admin/cobrancas       — cria { conta_id, nome, valor_mensal, dia_vencimento }
 * PATCH /api/admin/cobrancas       — { id, ativo?|valor_mensal?|dia_vencimento? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function proximoVencimento(diaMes: number, hoje = new Date()): Date {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(diaMes, 28));
  if (d <= hoje) d.setMonth(d.getMonth() + 1);
  return d;
}

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const rows = await db().query(
    `SELECT cb.*, ct.empresa,
            (SELECT MAX(competencia) FROM midia_faturas f WHERE f.cobranca_id = cb.id) AS ultima_competencia
       FROM midia_cobrancas_recorrentes cb
       JOIN midia_contas ct ON ct.id = cb.conta_id
      ORDER BY cb.created_at DESC`
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, cobrancas: rows });
}

const novo = z.object({
  conta_id:       z.string().uuid(),
  nome:           z.string().min(1).max(160),
  valor_mensal:   z.coerce.number().min(1),
  dia_vencimento: z.coerce.number().int().min(1).max(28).default(10),
});

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data; await ensureSchema();
  const prox = proximoVencimento(b.dia_vencimento);
  const r = await db().query<{ id: string }>(
    `INSERT INTO midia_cobrancas_recorrentes (conta_id, nome, valor_mensal, dia_vencimento, proximo_venc) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [b.conta_id, b.nome, b.valor_mensal, b.dia_vencimento, prox.toISOString().slice(0, 10)]
  );
  return NextResponse.json({ ok: true, id: r.rows[0].id });
}

const patch = z.object({
  id:              z.string().uuid(),
  ativo:           z.boolean().optional(),
  valor_mensal:    z.coerce.number().min(1).optional(),
  dia_vencimento:  z.coerce.number().int().min(1).max(28).optional(),
});

export async function PATCH(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  if (b.ativo          !== undefined) add("ativo",          b.ativo);
  if (b.valor_mensal   !== undefined) add("valor_mensal",   b.valor_mensal);
  if (b.dia_vencimento !== undefined) { add("dia_vencimento", b.dia_vencimento); add("proximo_venc", proximoVencimento(b.dia_vencimento).toISOString().slice(0, 10)); }
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });
  vals.push(b.id);
  await db().query(`UPDATE midia_cobrancas_recorrentes SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}
