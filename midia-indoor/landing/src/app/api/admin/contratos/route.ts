/**
 * GET  /api/admin/contratos?conta_id=  — contratos gerados de uma conta
 * POST /api/admin/contratos            — gera contrato { conta_id, template_id }
 *                                        (renderiza snapshot + hash; fica pendente de aceite)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster, autenticarAdmin } from "@/lib/admin-auth";
import { renderContrato, hashConteudo, type DadosContrato } from "@/lib/contratos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const contaId = req.nextUrl.searchParams.get("conta_id");
  if (!contaId) return NextResponse.json({ ok: false, error: "conta_id obrigatório" }, { status: 400 });
  try {
    await ensureSchema();
    const rows = await db().query(
      `SELECT id, titulo, conteudo_hash, aceito, aceito_em, aceito_nome, criado_em
         FROM midia_conta_contratos WHERE conta_id = $1 ORDER BY criado_em DESC`,
      [contaId]
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, contratos: rows });
  } catch (err) {
    console.error("[admin/contratos GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const gerar = z.object({ conta_id: z.string().uuid(), template_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = gerar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const { conta_id, template_id } = parsed.data;

  try {
    await ensureSchema();
    const p = db();

    const conta = await p.query<DadosContrato & Record<string, unknown>>(
      `SELECT c.nome AS cliente_nome, c.empresa AS cliente_empresa, c.email AS cliente_email,
              c.whatsapp AS cliente_whatsapp, c.cidade AS cliente_cidade,
              a.plano, a.qtd_telas, a.preco_tela
         FROM midia_contas c
         LEFT JOIN LATERAL (SELECT * FROM midia_assinaturas a2 WHERE a2.conta_id = c.id ORDER BY created_at DESC LIMIT 1) a ON true
        WHERE c.id = $1`,
      [conta_id]
    ).then(r => r.rows[0]);
    if (!conta) return NextResponse.json({ ok: false, error: "conta não encontrada" }, { status: 404 });

    const tpl = await p.query<{ titulo: string; conteudo_html: string }>(
      `SELECT titulo, conteudo_html FROM midia_contrato_templates WHERE id = $1`, [template_id]
    ).then(r => r.rows[0]);
    if (!tpl) return NextResponse.json({ ok: false, error: "modelo não encontrado" }, { status: 404 });

    const preco = Number(conta.preco_tela ?? 0);
    const qtd   = Number(conta.qtd_telas ?? 0);
    const dados: DadosContrato = {
      cliente_nome:     String(conta.cliente_nome ?? ""),
      cliente_empresa:  String(conta.cliente_empresa ?? ""),
      cliente_email:    String(conta.cliente_email ?? ""),
      cliente_whatsapp: conta.cliente_whatsapp as string | null,
      cliente_cidade:   conta.cliente_cidade as string | null,
      plano:            conta.plano as string | undefined,
      qtd_telas:        qtd,
      preco_tela:       preco,
      total_mensal:     Number((preco * qtd).toFixed(2)),
    };

    const html = renderContrato(tpl.conteudo_html, dados);
    const hash = hashConteudo(html);

    const id = await p.query<{ id: string }>(
      `INSERT INTO midia_conta_contratos (conta_id, template_id, titulo, conteudo_html, conteudo_hash)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [conta_id, template_id, tpl.titulo, html, hash]
    ).then(r => r.rows[0].id);

    return NextResponse.json({ ok: true, id, conteudo_html: html });
  } catch (err) {
    console.error("[admin/contratos POST]", err);
    return NextResponse.json({ ok: false, error: "erro ao gerar" }, { status: 500 });
  }
}
