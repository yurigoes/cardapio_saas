/**
 * Gestão de tenants (operadores DOOH revendendo o SaaS) — apenas super-master.
 *
 * GET    /api/admin/tenants
 * POST   /api/admin/tenants { slug, nome, dominios[], plano?, preco_mensal? }
 * PATCH  /api/admin/tenants { id, ativo?|nome?|dominios?|plano?|preco_mensal? }
 * DELETE /api/admin/tenants?id=...   (cuidado — apaga TUDO do tenant)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster } from "@/lib/admin-auth";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  await ensureSchema();
  const rows = await db().query(
    `SELECT t.*,
       (SELECT COUNT(*) FROM midia_contas WHERE tenant_id=t.id) AS anunciantes,
       (SELECT COUNT(*) FROM midia_campanhas WHERE tenant_id=t.id) AS campanhas,
       (SELECT COUNT(*) FROM midia_locais WHERE tenant_id=t.id) AS locais
       FROM midia_tenants t ORDER BY t.created_at DESC`
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, tenants: rows });
}

const novo = z.object({
  slug:         z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "só minúsculas/números/hífen"),
  nome:         z.string().min(1).max(160),
  dominios:     z.array(z.string().min(3)).min(1),
  plano:        z.enum(["basico", "pro", "enterprise"]).default("basico"),
  preco_mensal: z.coerce.number().min(0).default(0),
});

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  await ensureSchema();
  try {
    const r = await db().query<{ id: string }>(
      `INSERT INTO midia_tenants (slug, nome, dominios, plano, preco_mensal) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [b.slug, b.nome, b.dominios, b.plano, b.preco_mensal]
    );
    logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "tenant.criar", entidade: "tenant", entidade_id: r.rows[0].id, detalhes: { slug: b.slug } });
    return NextResponse.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    const msg = err instanceof Error && err.message.includes("duplicate") ? "slug já existe" : (err as Error).message;
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

const patch = z.object({
  id: z.string().uuid(),
  nome: z.string().min(1).max(160).optional(),
  dominios: z.array(z.string()).optional(),
  ativo: z.boolean().optional(),
  plano: z.enum(["basico", "pro", "enterprise"]).optional(),
  preco_mensal: z.coerce.number().min(0).optional(),
});

export async function PATCH(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  if (b.nome !== undefined)         add("nome", b.nome);
  if (b.dominios !== undefined)     add("dominios", b.dominios);
  if (b.ativo !== undefined)        add("ativo", b.ativo);
  if (b.plano !== undefined)        add("plano", b.plano);
  if (b.preco_mensal !== undefined) add("preco_mensal", b.preco_mensal);
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });
  vals.push(b.id);
  await db().query(`UPDATE midia_tenants SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}
