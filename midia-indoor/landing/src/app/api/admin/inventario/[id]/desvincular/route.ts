/**
 * POST /api/admin/inventario/[id]/desvincular
 * Body: { motivo?: 'problema'|'manutencao'|'substituicao'|'perda'|'outro', descricao?: string }
 *
 * Desvincula par TV<->Box. Se motivo='problema', abre OS automatica.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { desvincularItem, type OsMotivo } from "@/lib/inventario-os";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { motivo?: OsMotivo; descricao?: string };
  const r = await desvincularItem({
    inventarioId: params.id,
    motivo: body.motivo,
    descricao: body.descricao,
    autor: { tipo: "admin", id: master.sub, nome: master.nome },
  });
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
}
