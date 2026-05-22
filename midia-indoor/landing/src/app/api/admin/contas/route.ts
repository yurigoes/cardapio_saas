/**
 * GET /api/admin/contas — lista clientes + assinatura (pedidos).
 *   ?q= filtro por empresa/email   ?status=
 * PATCH /api/admin/contas — { conta_id, status } muda status da conta.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });

  const q      = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const status = req.nextUrl.searchParams.get("status")?.trim() ?? "";

  try {
    await ensureSchema();
    const cond: string[] = [];
    const vals: unknown[] = [];
    if (q)      { vals.push(`%${q}%`); cond.push(`(c.empresa ILIKE $${vals.length} OR c.email ILIKE $${vals.length} OR c.nome ILIKE $${vals.length})`); }
    if (status) { vals.push(status);  cond.push(`c.status = $${vals.length}`); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

    const rows = await db().query(
      `SELECT c.id, c.nome, c.empresa, c.email, c.whatsapp, c.cidade, c.status,
              c.provisionado_em, c.created_at,
              a.plano, a.preco_tela, a.qtd_telas, a.status AS assinatura_status,
              a.proximo_venc, a.ativada_em,
              (SELECT COUNT(*) FROM midia_telas t WHERE t.conta_id = c.id) AS telas
         FROM midia_contas c
         LEFT JOIN LATERAL (
           SELECT * FROM midia_assinaturas a2 WHERE a2.conta_id = c.id ORDER BY a2.created_at DESC LIMIT 1
         ) a ON true
         ${where}
         ORDER BY c.created_at DESC
         LIMIT 200`,
      vals
    ).then(r => r.rows);

    return NextResponse.json({ ok: true, contas: rows });
  } catch (err) {
    console.error("[admin/contas GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });

  try {
    const { conta_id, status } = await req.json() as { conta_id?: string; status?: string };
    const okStatus = ["pendente", "ativo", "suspenso", "cancelado"];
    if (!conta_id || !status || !okStatus.includes(status)) {
      return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
    }
    await ensureSchema();
    await db().query(`UPDATE midia_contas SET status = $1, updated_at = NOW() WHERE id = $2`, [status, conta_id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/contas PATCH]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
