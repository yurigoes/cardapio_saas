/**
 * GET   /api/admin/notas          — lista NFs (filtros: conta_id, status)
 * POST  /api/admin/notas          — cria NF { conta_id, campanha_id?, numero, serie?, valor, data_emissao, pdf_url?, xml_url? }
 * PATCH /api/admin/notas          — { id, status?|numero?|pdf_url?|xml_url? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const url = req.nextUrl;
  const conta = url.searchParams.get("conta_id"); const status = url.searchParams.get("status");
  const where: string[] = []; const vals: unknown[] = [];
  if (conta)  { vals.push(conta);  where.push(`nf.conta_id = $${vals.length}`); }
  if (status) { vals.push(status); where.push(`nf.status = $${vals.length}`); }
  const rows = await db().query(
    `SELECT nf.*, ct.empresa, c.nome AS campanha_nome
       FROM midia_notas_fiscais nf
       JOIN midia_contas ct ON ct.id = nf.conta_id
       LEFT JOIN midia_campanhas c ON c.id = nf.campanha_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY nf.data_emissao DESC, nf.created_at DESC LIMIT 500`,
    vals
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, notas: rows });
}

const novo = z.object({
  conta_id:     z.string().uuid(),
  campanha_id:  z.string().uuid().optional(),
  numero:       z.string().max(40).optional(),
  serie:        z.string().max(10).optional(),
  valor:        z.coerce.number().min(0),
  data_emissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pdf_url:      z.string().url().optional(),
  xml_url:      z.string().url().optional(),
  observacao:   z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  await ensureSchema();
  const r = await db().query<{ id: string }>(
    `INSERT INTO midia_notas_fiscais (conta_id, campanha_id, numero, serie, valor, data_emissao, pdf_url, xml_url, observacao, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $3 IS NULL THEN 'pendente' ELSE 'emitida' END) RETURNING id`,
    [b.conta_id, b.campanha_id ?? null, b.numero ?? null, b.serie ?? null, b.valor, b.data_emissao, b.pdf_url ?? null, b.xml_url ?? null, b.observacao ?? null]
  );
  logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "nf.criada", entidade: "nota_fiscal", entidade_id: r.rows[0].id, detalhes: { valor: b.valor, conta: b.conta_id } });
  return NextResponse.json({ ok: true, id: r.rows[0].id });
}

const patch = z.object({
  id:      z.string().uuid(),
  numero:  z.string().max(40).optional(),
  pdf_url: z.string().url().optional(),
  xml_url: z.string().url().optional(),
  status:  z.enum(["pendente", "emitida", "cancelada"]).optional(),
});

export async function PATCH(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  if (b.numero  !== undefined) add("numero",  b.numero);
  if (b.pdf_url !== undefined) add("pdf_url", b.pdf_url);
  if (b.xml_url !== undefined) add("xml_url", b.xml_url);
  if (b.status  !== undefined) add("status",  b.status);
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });
  vals.push(b.id);
  await db().query(`UPDATE midia_notas_fiscais SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}
