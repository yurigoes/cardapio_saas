/**
 * POST /api/admin/campanhas/[id]/duplicar  — cria nova campanha clonando config + locais
 * Não copia: xibo refs, arte, datas, status pagamento. Volta como 'rascunho'.
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
  const p = db();

  const orig = await p.query(
    `SELECT conta_id, pacote_id, nome, tipo, dias, insercoes_dia, segundos, hora_inicio, hora_fim,
            dias_semana, formato, valor
       FROM midia_campanhas WHERE id = $1`, [params.id]
  ).then(r => r.rows[0]);
  if (!orig) return NextResponse.json({ ok: false, error: "campanha não encontrada" }, { status: 404 });

  const novaId = await p.query<{ id: string }>(
    `INSERT INTO midia_campanhas (conta_id, pacote_id, nome, tipo, dias, insercoes_dia, segundos, hora_inicio, hora_fim, dias_semana, formato, valor, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'rascunho') RETURNING id`,
    [orig.conta_id, orig.pacote_id, `${orig.nome} (cópia)`, orig.tipo, orig.dias, orig.insercoes_dia, orig.segundos, orig.hora_inicio, orig.hora_fim, orig.dias_semana, orig.formato, orig.valor]
  ).then(r => r.rows[0].id);

  // Copia locais
  await p.query(
    `INSERT INTO midia_campanha_locais (campanha_id, local_id)
     SELECT $1, local_id FROM midia_campanha_locais WHERE campanha_id = $2`,
    [novaId, params.id]
  );

  logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "campanha.duplicar", entidade: "campanha", entidade_id: novaId, detalhes: { origem: params.id } });
  return NextResponse.json({ ok: true, id: novaId });
}
