/**
 * GET /api/painel/me
 * Dados da conta autenticada + status da assinatura.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });

  try {
    await ensureSchema();
    const p = db();

    const conta = await p.query<{
      id: string; nome: string; empresa: string; email: string; status: string;
      xibo_folder_id: number | null; xibo_display_group_id: number | null;
    }>(
      `SELECT id, nome, empresa, email, status, xibo_folder_id, xibo_display_group_id
         FROM midia_contas WHERE id = $1`,
      [auth.sub]
    ).then(r => r.rows[0]);

    if (!conta) return NextResponse.json({ ok: false, error: "conta não encontrada" }, { status: 404 });

    const assin = await p.query<{
      plano: string; preco_tela: string; qtd_telas: number; status: string; proximo_venc: string | null;
    }>(
      `SELECT plano, preco_tela, qtd_telas, status, proximo_venc
         FROM midia_assinaturas WHERE conta_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [auth.sub]
    ).then(r => r.rows[0]);

    return NextResponse.json({
      ok: true,
      conta: {
        nome: conta.nome, empresa: conta.empresa, email: conta.email, status: conta.status,
        provisionado: Boolean(conta.xibo_folder_id && conta.xibo_display_group_id),
      },
      assinatura: assin ? {
        plano: assin.plano,
        preco_tela: Number(assin.preco_tela),
        qtd_telas: assin.qtd_telas,
        status: assin.status,
        proximo_venc: assin.proximo_venc,
        total_mensal: Number((Number(assin.preco_tela) * assin.qtd_telas).toFixed(2)),
      } : null,
    });
  } catch (err) {
    console.error("[painel/me]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
