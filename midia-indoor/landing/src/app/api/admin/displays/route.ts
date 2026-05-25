/**
 * GET  /api/admin/displays — lista players (status + local vinculado)
 * POST /api/admin/displays — ações:
 *   { acao:"autorizar", displayId }
 *   { acao:"vincular",  displayId, local_id }   (autoriza + cria/garante display group do local)
 *   { acao:"desvincular", displayId, local_id }
 *   { acao:"renomear", displayId, nome }
 *   { acao:"excluir",  displayId }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import {
  listarDisplaysFull, autorizarDisplay, adicionarDisplayAoGrupo, removerDisplayDoGrupo,
  renomearDisplay, excluirDisplay, criarDisplayGroup,
} from "@/lib/xibo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    await ensureSchema();
    const locais = await db().query<{ id: string; nome: string; xibo_display_group_id: number | null }>(
      `SELECT id, nome, xibo_display_group_id FROM midia_locais`
    ).then(r => r.rows);
    const dgToLocal = new Map(locais.filter(l => l.xibo_display_group_id).map(l => [l.xibo_display_group_id!, l]));

    const displays = await listarDisplaysFull();
    const lista = displays.map(d => {
      const grupos = d.displayGroups ?? [];
      const local = grupos.map(g => dgToLocal.get(g.displayGroupId)).find(Boolean) ?? null;
      return {
        displayId: d.displayId,
        nome: d.display,
        autorizado: d.authorised === 1,
        online: d.loggedIn === 1,
        ultimoAcesso: d.lastAccessed,
        clientType: d.clientType ?? "",
        local: local ? { id: local.id, nome: local.nome } : null,
      };
    });
    return NextResponse.json({ ok: true, displays: lista, locais: locais.map(l => ({ id: l.id, nome: l.nome })) });
  } catch (err) {
    console.error("[admin/displays GET]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}

async function dgDoLocal(localId: string): Promise<number | null> {
  const p = db();
  const l = await p.query<{ nome: string; cidade: string | null; xibo_display_group_id: number | null }>(
    `SELECT nome, cidade, xibo_display_group_id FROM midia_locais WHERE id = $1`, [localId]
  ).then(r => r.rows[0]);
  if (!l) return null;
  if (l.xibo_display_group_id) return l.xibo_display_group_id;
  const dg = await criarDisplayGroup(`Local — ${l.nome}`, l.cidade ?? "");
  await p.query(`UPDATE midia_locais SET xibo_display_group_id = $1, updated_at = NOW() WHERE id = $2`, [dg, localId]);
  return dg;
}

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const b = await req.json().catch(() => null) as { acao?: string; displayId?: number; local_id?: string; nome?: string } | null;
  if (!b?.acao || !b.displayId) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });

  try {
    await ensureSchema();
    switch (b.acao) {
      case "autorizar":
        await autorizarDisplay(b.displayId);
        break;
      case "vincular": {
        if (!b.local_id) return NextResponse.json({ ok: false, error: "local_id obrigatório" }, { status: 400 });
        const dg = await dgDoLocal(b.local_id);
        if (!dg) return NextResponse.json({ ok: false, error: "local inválido" }, { status: 400 });
        await autorizarDisplay(b.displayId).catch(() => { /* já pode estar autorizado */ });
        await adicionarDisplayAoGrupo(b.displayId, dg);
        break;
      }
      case "desvincular": {
        if (!b.local_id) return NextResponse.json({ ok: false, error: "local_id obrigatório" }, { status: 400 });
        const dg = await dgDoLocal(b.local_id);
        if (dg) await removerDisplayDoGrupo(b.displayId, dg);
        break;
      }
      case "renomear":
        if (!b.nome) return NextResponse.json({ ok: false, error: "nome obrigatório" }, { status: 400 });
        await renomearDisplay(b.displayId, b.nome);
        break;
      case "excluir":
        await excluirDisplay(b.displayId);
        break;
      default:
        return NextResponse.json({ ok: false, error: "ação desconhecida" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/displays POST]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
