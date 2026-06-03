/**
 * POST /api/admin/locais/[id]/ativar-tela
 * Body: { codigo, nome? }
 * Ativa uma TV pelo código exibido no player Xibo recém-instalado e vincula
 * ao display group do local. Cria o display group se ainda não existe.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster } from "@/lib/admin-auth";
import { ativarDisplayPorCodigo, vincularDisplayAoGrupo, criarDisplayGroup, setDefaultLayout } from "@/lib/xibo";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

const schema = z.object({
  codigo: z.string().min(4).max(8),
  nome:   z.string().max(80).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });

  try {
    await ensureSchema();
    const local = await db().query<{ id: string; nome: string; cidade: string | null; xibo_display_group_id: number | null; splash_layout_id: number | null }>(
      `SELECT id, nome, cidade, xibo_display_group_id, splash_layout_id FROM midia_locais WHERE id = $1`,
      [params.id]
    ).then(r => r.rows[0]);
    if (!local) return NextResponse.json({ ok: false, error: "local não encontrado" }, { status: 404 });

    // Garante o display group
    let dgId = local.xibo_display_group_id;
    if (!dgId) {
      dgId = await criarDisplayGroup(`Local — ${local.nome}`, local.cidade ?? "");
      await db().query(`UPDATE midia_locais SET xibo_display_group_id = $1, updated_at = NOW() WHERE id = $2`, [dgId, params.id]);
    }

    // Ativa o display pelo código
    const nomeDisplay = parsed.data.nome ?? `${local.nome} — Tela`;
    const { displayId } = await ativarDisplayPorCodigo(parsed.data.codigo, nomeDisplay);

    // Vincula ao display group do local
    try { await vincularDisplayAoGrupo(displayId, dgId); }
    catch (e) { console.warn("[ativar-tela] vincular ao grupo falhou:", (e as Error).message); }

    // Se tiver splash, aplica como default
    if (local.splash_layout_id) {
      try { await setDefaultLayout(displayId, local.splash_layout_id); }
      catch (e) { console.warn("[ativar-tela] setDefaultLayout falhou:", (e as Error).message); }
    }

    logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "tela.ativar-codigo", entidade: "local", entidade_id: params.id, detalhes: { codigo: parsed.data.codigo, displayId } });
    return NextResponse.json({ ok: true, displayId, msg: "Tela ativada e vinculada ao local. O player deve atualizar em segundos." });
  } catch (err) {
    console.error("[ativar-tela]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
