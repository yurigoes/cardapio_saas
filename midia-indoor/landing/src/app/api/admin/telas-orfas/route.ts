/**
 * GET /api/admin/telas-orfas
 * Lista displays registrados no Xibo que ainda NÃO foram vinculados a nenhum
 * local do SaaS. Útil pra ver TVs novas chegando e fazer o "vincular".
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";
import { listarDisplaysFull } from "@/lib/xibo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();

  const locais = await db().query<{ id: string; nome: string; xibo_display_group_id: number | null }>(
    `SELECT id, nome, xibo_display_group_id FROM midia_locais WHERE archived_at IS NULL`
  ).then(r => r.rows);
  const gruposComLocal = new Set(locais.filter(l => l.xibo_display_group_id).map(l => l.xibo_display_group_id!));

  const displays = await listarDisplaysFull();
  const orfas = displays
    .filter(d => {
      const grupos = (d.displayGroups ?? []).map(g => g.displayGroupId);
      // tem algum grupo que está vinculado a algum local? se não, é órfã
      return !grupos.some(gId => gruposComLocal.has(gId));
    })
    .map(d => ({
      displayId: d.displayId,
      nome: d.display,
      hardwareKey: d.license ?? "",
      online: d.loggedIn === 1,
      autorizado: (d.licensed ?? d.authorised) === 1,
      lastAccessed: d.lastAccessed,
      clientAddress: (d as { clientAddress?: string }).clientAddress ?? "",
    }))
    .sort((a, b) => (Number(b.lastAccessed) || 0) - (Number(a.lastAccessed) || 0));

  return NextResponse.json({ ok: true, telas_orfas: orfas, total_locais: locais.length });
}
