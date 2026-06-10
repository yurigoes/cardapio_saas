/**
 * POST /api/admin/campanhas/[id]/aprovar  — body { acao:"aprovar"|"rejeitar", motivo? }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster } from "@/lib/admin-auth";
import { logAudit } from "@/lib/auditoria";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const b = await req.json().catch(() => ({})) as { acao?: string; motivo?: string };
  if (b.acao !== "aprovar" && b.acao !== "rejeitar") return NextResponse.json({ ok: false, error: "acao inválida" }, { status: 400 });
  await ensureSchema();
  if (b.acao === "aprovar") {
    await db().query(`UPDATE midia_campanhas SET arte_status='aprovada', arte_rejeicao_motivo=NULL, updated_at=NOW() WHERE id=$1`, [params.id]);
  } else {
    await db().query(`UPDATE midia_campanhas SET arte_status='rejeitada', arte_rejeicao_motivo=$1, updated_at=NOW() WHERE id=$2`, [b.motivo ?? "não especificado", params.id]);
  }
  logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: `campanha.arte.${b.acao}`, entidade: "campanha", entidade_id: params.id, detalhes: { motivo: b.motivo } });

  // Notifica anunciante via WhatsApp
  try {
    const camp = await db().query<{ conta_id: string; nome: string }>(
      `SELECT conta_id, nome FROM midia_campanhas WHERE id = $1`, [params.id]
    ).then(r => r.rows[0]);
    if (camp) {
      const { enviarWhatsAppParaConta } = await import("@/lib/whatsapp");
      if (b.acao === "aprovar") {
        await enviarWhatsAppParaConta({
          contaId: camp.conta_id, tipo: "arte_aprovada",
          cabecalho: "✅ Arte aprovada!",
          mensagem: `A arte da sua campanha *${camp.nome}* foi aprovada.\n\nAssim que o pagamento for confirmado, ela vai pro ar automaticamente.`,
        });
      } else {
        await enviarWhatsAppParaConta({
          contaId: camp.conta_id, tipo: "arte_rejeitada",
          cabecalho: "⚠ Arte precisa de ajuste",
          mensagem: `A arte da campanha *${camp.nome}* foi rejeitada.\n\n*Motivo:* ${b.motivo ?? "não especificado"}\n\nEnvie uma nova versão pelo painel.`,
        });
      }
    }
  } catch (e) { console.warn("[aprovar] whatsapp falhou:", (e as Error).message); }

  return NextResponse.json({ ok: true });
}
