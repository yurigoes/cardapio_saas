/**
 * GET   /api/admin/locais/grupos          — lista grupos com membros
 * POST  /api/admin/locais/grupos          — { nome, cidade?, sincronia?, membros: [localId...] }
 * PATCH /api/admin/locais/grupos          — { id, nome?, sincronia?, membros? }
 * DELETE /api/admin/locais/grupos?id=...  — exclui grupo (não os filhos)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { criarDisplayGroupAgregador, setMembrosDoAgregador } from "@/lib/xibo";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();

  const grupos = await db().query(
    `SELECT id, nome, cidade, sincronia, xibo_display_group_id, archived_at
       FROM midia_locais WHERE tipo='grupo' AND archived_at IS NULL ORDER BY nome`
  ).then(r => r.rows);

  // Anexa membros
  const ids = grupos.map(g => g.id);
  let membros: Array<{ grupo_id: string; membro_id: string; ordem: number; membro_nome: string; membro_cidade: string | null }> = [];
  if (ids.length) {
    membros = await db().query(
      `SELECT m.grupo_id, m.membro_id, m.ordem, l.nome AS membro_nome, l.cidade AS membro_cidade
         FROM midia_local_grupo_membros m
         JOIN midia_locais l ON l.id = m.membro_id
        WHERE m.grupo_id = ANY($1::uuid[]) ORDER BY m.ordem`,
      [ids]
    ).then(r => r.rows);
  }

  const result = grupos.map(g => ({
    ...g,
    membros: membros.filter(m => m.grupo_id === g.id).map(m => ({ id: m.membro_id, nome: m.membro_nome, cidade: m.membro_cidade, ordem: m.ordem })),
  }));

  return NextResponse.json({ ok: true, grupos: result });
}

const novo = z.object({
  nome:      z.string().min(1).max(160),
  cidade:    z.string().max(120).optional(),
  sincronia: z.boolean().default(false),
  membros:   z.array(z.string().uuid()).min(1, "escolha pelo menos 1 local membro"),
});

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  await ensureSchema();
  const p = db();

  // Confirma que cada membro existe e NÃO é um grupo (sem aninhamento)
  const checa = await p.query(
    `SELECT id, tipo, xibo_display_group_id FROM midia_locais WHERE id = ANY($1::uuid[]) AND archived_at IS NULL`,
    [b.membros]
  ).then(r => r.rows);
  if (checa.length !== b.membros.length) return NextResponse.json({ ok: false, error: "um ou mais membros não encontrados/ativos" }, { status: 400 });
  if (checa.some(c => c.tipo === "grupo")) return NextResponse.json({ ok: false, error: "não pode aninhar grupo dentro de grupo" }, { status: 400 });

  // Cria o display group agregador no Xibo
  let xiboGrupoId: number | null = null;
  try { xiboGrupoId = await criarDisplayGroupAgregador(`Grupo — ${b.nome}`, b.cidade ?? "", b.sincronia); }
  catch (e) { console.warn("[grupos POST] criar xibo group:", (e as Error).message); }

  // Vincula no Xibo (membros que têm display group próprio)
  const grupoFilhosXibo = checa.map(c => c.xibo_display_group_id).filter((x): x is number => !!x);
  if (xiboGrupoId && grupoFilhosXibo.length) {
    try { await setMembrosDoAgregador(xiboGrupoId, grupoFilhosXibo); }
    catch (e) { console.warn("[grupos POST] vincular filhos:", (e as Error).message); }
  }

  // Cria o "Local-grupo" no nosso DB (entry em midia_locais com tipo='grupo')
  const grupoId = await p.query<{ id: string }>(
    `INSERT INTO midia_locais (nome, cidade, largura, altura, ativo, tipo, sincronia, xibo_display_group_id)
     VALUES ($1, $2, 0, 0, true, 'grupo', $3, $4) RETURNING id`,
    [b.nome, b.cidade ?? null, b.sincronia, xiboGrupoId]
  ).then(r => r.rows[0].id);

  // Insere membros
  for (let i = 0; i < b.membros.length; i++) {
    await p.query(
      `INSERT INTO midia_local_grupo_membros (grupo_id, membro_id, ordem) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [grupoId, b.membros[i], i]
    );
  }

  logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "local-grupo.criar", entidade: "local", entidade_id: grupoId, detalhes: { nome: b.nome, membros: b.membros.length, sincronia: b.sincronia } });
  return NextResponse.json({ ok: true, id: grupoId, xibo_display_group_id: xiboGrupoId });
}

const patch = z.object({
  id:        z.string().uuid(),
  nome:      z.string().min(1).max(160).optional(),
  sincronia: z.boolean().optional(),
  membros:   z.array(z.string().uuid()).optional(),
});

export async function PATCH(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  const p = db();

  if (b.nome) await p.query(`UPDATE midia_locais SET nome=$1, updated_at=NOW() WHERE id=$2`, [b.nome, b.id]);
  if (b.sincronia !== undefined) await p.query(`UPDATE midia_locais SET sincronia=$1 WHERE id=$2`, [b.sincronia, b.id]);

  // Sincroniza membros
  if (b.membros) {
    await p.query(`DELETE FROM midia_local_grupo_membros WHERE grupo_id = $1`, [b.id]);
    for (let i = 0; i < b.membros.length; i++) {
      await p.query(`INSERT INTO midia_local_grupo_membros (grupo_id, membro_id, ordem) VALUES ($1, $2, $3)`, [b.id, b.membros[i], i]);
    }
    // Atualiza Xibo
    const grupo = await p.query<{ xibo_display_group_id: number | null }>(
      `SELECT xibo_display_group_id FROM midia_locais WHERE id=$1`, [b.id]
    ).then(r => r.rows[0]);
    if (grupo?.xibo_display_group_id) {
      const filhos = await p.query<{ xibo_display_group_id: number | null }>(
        `SELECT l.xibo_display_group_id FROM midia_local_grupo_membros m JOIN midia_locais l ON l.id = m.membro_id WHERE m.grupo_id = $1`,
        [b.id]
      ).then(r => r.rows.map(x => x.xibo_display_group_id).filter((x): x is number => !!x));
      try { await setMembrosDoAgregador(grupo.xibo_display_group_id, filhos); }
      catch (e) { console.warn("[grupos PATCH] xibo sync:", (e as Error).message); }
    }
  }

  logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "local-grupo.editar", entidade: "local", entidade_id: b.id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 });
  // Não apaga os locais membros, só o grupo
  await db().query(`DELETE FROM midia_locais WHERE id = $1 AND tipo='grupo'`, [id]);
  logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "local-grupo.excluir", entidade: "local", entidade_id: id });
  return NextResponse.json({ ok: true });
}
