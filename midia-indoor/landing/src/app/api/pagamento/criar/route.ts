/**
 * POST /api/pagamento/criar
 * Cria a assinatura recorrente no Mercado Pago pra conta autenticada e
 * devolve a URL (init_point) pro cliente pagar.
 *
 * Header: Authorization: Bearer <jwt>
 * Resp:   { ok, init_point, preapproval_id }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";
import { criarPreApproval } from "@/lib/mercadopago";
import { PLANOS } from "@/lib/planos";

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });

  try {
    await ensureSchema();
    const p = db();

    // Assinatura pendente mais recente da conta
    const assin = await p.query<{
      id: string; plano: string; preco_tela: string; qtd_telas: number; status: string; gateway_ref: string | null;
    }>(
      `SELECT id, plano, preco_tela, qtd_telas, status, gateway_ref
         FROM midia_assinaturas
        WHERE conta_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [auth.sub]
    ).then(r => r.rows[0]);

    if (!assin) return NextResponse.json({ ok: false, error: "assinatura não encontrada" }, { status: 404 });
    if (assin.status === "ativa") {
      return NextResponse.json({ ok: false, error: "assinatura já está ativa" }, { status: 409 });
    }

    const plano = PLANOS.find(p => p.id === assin.plano);
    const valorMensal = Number(assin.preco_tela) * assin.qtd_telas;
    const descricao = `Three Digital Mídia — ${plano?.nome ?? assin.plano} (${assin.qtd_telas} tela${assin.qtd_telas > 1 ? "s" : ""})`;

    const { id, init_point } = await criarPreApproval({
      assinaturaId: assin.id,
      email:        auth.email,
      valorMensal,
      descricao,
    });

    await p.query(
      `UPDATE midia_assinaturas
          SET gateway = 'mercadopago', gateway_ref = $1, updated_at = NOW()
        WHERE id = $2`,
      [id, assin.id]
    );

    return NextResponse.json({ ok: true, init_point, preapproval_id: id });
  } catch (err) {
    console.error("[pagamento/criar]", err);
    return NextResponse.json({ ok: false, error: "erro ao criar pagamento" }, { status: 500 });
  }
}
