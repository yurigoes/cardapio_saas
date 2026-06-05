/**
 * GET   /api/admin/display-profiles                 — lista perfis do Xibo
 * PATCH /api/admin/display-profiles  { id, patches }— atualiza keys do config
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { listarDisplayProfiles, atualizarDisplayProfile } from "@/lib/xibo";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    const profiles = await listarDisplayProfiles();
    return NextResponse.json({ ok: true, profiles });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}

const patch = z.object({
  id:      z.coerce.number().int().positive(),
  patches: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

export async function PATCH(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  try {
    await atualizarDisplayProfile(parsed.data.id, parsed.data.patches);
    logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "display-profile.update", entidade: "displayProfile", entidade_id: String(parsed.data.id), detalhes: parsed.data.patches });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
