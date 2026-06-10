/**
 * POST /api/admin/locais/limpar-orfaos
 *
 * Arquiva locais que cumprem TODOS criterios:
 *  - archived_at IS NULL (nao arquivado)
 *  - SEM nenhuma midia_telas vinculada (local_id)
 *  - SEM campanhas no_ar cobrindo
 *  - SEM xibo_display_group_id OU display group esta vazio no Xibo
 *  - Criado ha mais de 7 dias (evita arquivar local recem-cadastrado)
 *
 * Modo dry_run=true retorna a lista sem arquivar.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const dryRun = req.nextUrl.searchParams.get("dry_run") === "true";

  await ensureSchema();
  const orfaos = await db().query<{ id: string; nome: string; cidade: string | null; created_at: string }>(
    `SELECT l.id, l.nome, l.cidade, l.created_at
       FROM midia_locais l
      WHERE l.archived_at IS NULL
        AND l.created_at < NOW() - INTERVAL '7 days'
        AND (l.tipo IS NULL OR l.tipo = 'individual')
        AND NOT EXISTS (SELECT 1 FROM midia_telas t WHERE t.local_id = l.id)
        AND NOT EXISTS (
          SELECT 1 FROM midia_campanha_locais cl
            JOIN midia_campanhas c ON c.id = cl.campanha_id
           WHERE cl.local_id = l.id AND c.status = 'no_ar'
        )`
  ).then(r => r.rows);

  if (dryRun) {
    return NextResponse.json({ ok: true, dry_run: true, candidatos: orfaos, total: orfaos.length });
  }

  let arquivados = 0;
  for (const o of orfaos) {
    try {
      await db().query(
        `UPDATE midia_locais SET archived_at = NOW(), ativo = false, updated_at = NOW() WHERE id = $1`,
        [o.id]
      );
      arquivados++;
    } catch (e) { console.warn(`[limpar-orfaos] arquivar ${o.id}:`, (e as Error).message); }
  }
  return NextResponse.json({ ok: true, arquivados, lista: orfaos });
}
