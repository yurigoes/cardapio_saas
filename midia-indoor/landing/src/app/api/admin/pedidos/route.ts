/**
 * GET   /api/admin/pedidos?status=pendente — lista pedidos (orçamentos) p/ revisão
 * POST  /api/admin/pedidos                 — ações do master:
 *   { acao: "aprovar", id, nome?, locais?: string[] } — converte em campanha (rascunho, a pagar)
 *   { acao: "recusar", id, motivo? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const status = req.nextUrl.searchParams.get("status");
  const filtro = status ? "WHERE p.status = $1" : "";
  const args = status ? [status] : [];
  const rows = await db().query(
    `SELECT p.id, p.orientacao, p.insercoes_dia, p.segundos, p.dias, p.valor, p.observacao,
            p.status, p.motivo_recusa, p.campanha_id, p.criado_em, p.revisado_em,
            ct.empresa, ct.nome AS anunciante, ct.id AS conta_id
       FROM midia_pedidos p JOIN midia_contas ct ON ct.id = p.conta_id
       ${filtro} ORDER BY p.criado_em DESC LIMIT 300`, args
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, pedidos: rows });
}

const schema = z.object({
  acao: z.enum(["aprovar", "recusar"]),
  id: z.string().uuid(),
  nome: z.string().max(160).optional(),
  locais: z.array(z.string().uuid()).optional(),
  motivo: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  await ensureSchema();
  const p = db();

  const ped = await p.query(
    `SELECT * FROM midia_pedidos WHERE id = $1`, [b.id]
  ).then(r => r.rows[0]);
  if (!ped) return NextResponse.json({ ok: false, error: "pedido não encontrado" }, { status: 404 });
  if (ped.status !== "pendente") return NextResponse.json({ ok: false, error: `pedido já ${ped.status}` }, { status: 400 });

  if (b.acao === "recusar") {
    await p.query(
      `UPDATE midia_pedidos SET status = 'recusado', motivo_recusa = $1, revisado_em = NOW() WHERE id = $2`,
      [b.motivo ?? null, b.id]
    );
    return NextResponse.json({ ok: true });
  }

  // aprovar → cria campanha (rascunho, a pagar) com os params do pedido
  const conta = await p.query<{ empresa: string }>(`SELECT empresa FROM midia_contas WHERE id = $1`, [ped.conta_id]).then(r => r.rows[0]);
  const nome = b.nome?.trim() || `Inserções ${ped.orientacao} — ${conta?.empresa ?? ""}`.trim();

  // Locais: usa os informados OU pega todos ativos com a orientacao do pedido
  let locais = b.locais ?? [];
  if (!locais.length) {
    locais = await p.query<{ id: string }>(
      `SELECT id FROM midia_locais WHERE ativo = true AND archived_at IS NULL AND orientacao = $1`,
      [ped.orientacao]
    ).then(r => r.rows.map(x => x.id));
  }
  if (!locais.length) {
    return NextResponse.json({ ok: false, error: `nenhum totem ${ped.orientacao} ativo — cadastre/ative locais dessa orientação ou informe locais manualmente` }, { status: 400 });
  }

  const campId = await p.query<{ id: string }>(
    `INSERT INTO midia_campanhas (conta_id, nome, tipo, dias, insercoes_dia, segundos, valor, status, status_pagamento, formato)
     VALUES ($1,$2,'video',$3,$4,$5,$6,'rascunho','pendente','simples') RETURNING id`,
    [ped.conta_id, nome, ped.dias, ped.insercoes_dia, ped.segundos, ped.valor]
  ).then(r => r.rows[0].id);

  for (const localId of locais) {
    await p.query(`INSERT INTO midia_campanha_locais (campanha_id, local_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [campId, localId]);
  }

  await p.query(
    `UPDATE midia_pedidos SET status = 'convertido', campanha_id = $1, revisado_em = NOW() WHERE id = $2`,
    [campId, b.id]
  );

  // Avisa o anunciante (best-effort)
  try {
    const { enviarWhatsAppParaConta } = await import("@/lib/whatsapp");
    await enviarWhatsAppParaConta({
      contaId: ped.conta_id, tipo: "pedido_aprovado",
      cabecalho: "✅ Pedido aprovado!",
      mensagem: `Seu pedido de inserções foi aprovado e virou a campanha "${nome}". Acesse o painel pra enviar a arte e efetuar o pagamento.`,
    });
  } catch (e) { console.warn("[pedidos aprovar] whatsapp:", (e as Error).message); }

  return NextResponse.json({ ok: true, campanha_id: campId, locais: locais.length });
}
