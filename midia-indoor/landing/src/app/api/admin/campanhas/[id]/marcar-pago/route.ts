/**
 * POST /api/admin/campanhas/[id]/marcar-pago
 * Admin marca uma campanha como paga manualmente (recebeu PIX direto fora do checkout).
 * Body: { metodo?: string, observacao?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster } from "@/lib/admin-auth";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const metodo = String(body.metodo || "manual").trim();
  const observacao = String(body.observacao || "").trim();

  // Marca a campanha como paga
  const r = await db().query<{ valor: string }>(
    `UPDATE midia_campanhas SET status_pagamento = 'pago' WHERE id = $1 RETURNING valor::text`,
    [params.id]
  );
  if (!r.rows[0]) return NextResponse.json({ ok: false, error: "Campanha não encontrada" }, { status: 404 });

  // Se houver link InfinityPay pendente, marca como pago tb (registro auditável)
  const centavos = Math.round(Number(r.rows[0].valor || 0) * 100);
  await db().query(
    `UPDATE midia_infinity_links
        SET status='pago', paid_at=NOW(), paid_amount_centavos=$2, capture_method=$3, updated_at=NOW()
      WHERE campanha_id=$1 AND status='pendente'`,
    [params.id, centavos, `manual_admin: ${metodo}`]
  );

  logAudit(req, {
    autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome,
    acao: "campanha.marcar_pago_manual", entidade: "campanha", entidade_id: params.id,
    detalhes: { metodo, observacao },
  });

  return NextResponse.json({ ok: true });
}
