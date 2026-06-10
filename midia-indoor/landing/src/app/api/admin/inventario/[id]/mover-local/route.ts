/**
 * POST /api/admin/inventario/[id]/mover-local
 * Body: { local_id: string|null, mover_display_xibo?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { moverItemDeLocal } from "@/lib/inventario-os";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const body = await req.json().catch(() => null) as { local_id?: string | null; mover_display_xibo?: boolean } | null;
  if (!body) return NextResponse.json({ ok: false, error: "body invalido" }, { status: 400 });
  const r = await moverItemDeLocal({
    inventarioId: params.id,
    novoLocalId: body.local_id ?? null,
    moverDisplayXibo: Boolean(body.mover_display_xibo),
    autor: { tipo: "admin", id: master.sub, nome: master.nome },
  });
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
}
