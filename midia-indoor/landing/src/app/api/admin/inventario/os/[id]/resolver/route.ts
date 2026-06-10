/**
 * POST /api/admin/inventario/os/[id]/resolver
 * Body: { veredito: 'queimado'|'consertado'|'sem_problema'|'substituir'|'descartar',
 *         veredito_obs?, custo_centavos?, substituido_por_id? }
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { resolverOS, type OsVeredito } from "@/lib/inventario-os";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const body = await req.json().catch(() => null) as { veredito?: OsVeredito; veredito_obs?: string; custo_centavos?: number; substituido_por_id?: string } | null;
  if (!body?.veredito) return NextResponse.json({ ok: false, error: "veredito obrigatorio" }, { status: 400 });
  const r = await resolverOS({
    osId: params.id,
    veredito: body.veredito,
    vereditoObs: body.veredito_obs,
    custoCentavos: body.custo_centavos,
    substituidoPorId: body.substituido_por_id,
    autor: { tipo: "master", id: master.sub, nome: master.nome },
  });
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
}
