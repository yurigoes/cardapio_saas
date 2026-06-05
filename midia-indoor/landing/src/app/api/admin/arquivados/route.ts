/**
 * GET   /api/admin/arquivados        — lista campanhas/locais/anunciantes arquivados (master)
 * PATCH /api/admin/arquivados        — { tipo, id, acao: "reativar"|"excluir" }
 *
 * Regras:
 *  - Campanhas encerradas, locais inativos e anunciantes inativos têm `archived_at` setado.
 *  - O cron `/api/cron/limpeza-arquivados` apaga definitivamente após 6 meses.
 *  - Reativar: zera archived_at + volta status pra ativo/rascunho/etc.
 *  - Excluir: hard delete (cuidado).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { excluirCampanha as excluirCampanhaXibo } from "@/lib/xibo";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const p = db();

  const campanhas = await p.query(
    `SELECT c.id, c.nome, c.status, c.data_fim, c.archived_at, ct.empresa,
            (NOW() - c.archived_at) AS idade_arquivo
       FROM midia_campanhas c
       LEFT JOIN midia_contas ct ON ct.id = c.conta_id
      WHERE c.archived_at IS NOT NULL
      ORDER BY c.archived_at DESC LIMIT 500`
  ).then(r => r.rows);

  const locais = await p.query(
    `SELECT id, nome, cidade, archived_at, (NOW() - archived_at) AS idade_arquivo
       FROM midia_locais WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 500`
  ).then(r => r.rows);

  const anunciantes = await p.query(
    `SELECT id, empresa, nome, email, status, archived_at, (NOW() - archived_at) AS idade_arquivo
       FROM midia_contas WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 500`
  ).then(r => r.rows);

  // Dias até purge automático (180d desde archived_at)
  const calcDias = (rows: Array<{ archived_at: string }>) => rows.map(r => {
    const arq = new Date(r.archived_at).getTime();
    const dias = Math.max(0, 180 - Math.floor((Date.now() - arq) / 86400000));
    return { ...r, dias_ate_purge: dias };
  });

  return NextResponse.json({
    ok: true,
    campanhas: calcDias(campanhas),
    locais: calcDias(locais),
    anunciantes: calcDias(anunciantes),
  });
}

const patch = z.object({
  tipo: z.enum(["campanha", "local", "anunciante"]),
  id:   z.string().uuid(),
  acao: z.enum(["reativar", "excluir"]),
});

export async function PATCH(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;
  const p = db();

  try {
    if (b.acao === "reativar") {
      if (b.tipo === "campanha") {
        await p.query(`UPDATE midia_campanhas SET archived_at = NULL, status = 'rascunho', updated_at = NOW() WHERE id = $1`, [b.id]);
      } else if (b.tipo === "local") {
        await p.query(`UPDATE midia_locais SET archived_at = NULL, ativo = true, updated_at = NOW() WHERE id = $1`, [b.id]);
      } else if (b.tipo === "anunciante") {
        await p.query(`UPDATE midia_contas SET archived_at = NULL, status = 'ativo', updated_at = NOW() WHERE id = $1`, [b.id]);
      }
      logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: `arquivado.reativar.${b.tipo}`, entidade: b.tipo, entidade_id: b.id });
      return NextResponse.json({ ok: true, msg: "Reativado" });
    }

    if (b.acao === "excluir") {
      if (b.tipo === "campanha") {
        // tenta limpar do Xibo (ad campaign + layout)
        const camp = await p.query<{ xibo_campaign_id: number | null; xibo_layout_id: number | null }>(
          `SELECT xibo_campaign_id, xibo_layout_id FROM midia_campanhas WHERE id = $1`, [b.id]
        ).then(r => r.rows[0]);
        if (camp?.xibo_campaign_id) { try { await excluirCampanhaXibo(camp.xibo_campaign_id); } catch (e) { console.warn("[arquivados] excluir xibo campaign:", (e as Error).message); } }
        await p.query(`DELETE FROM midia_campanhas WHERE id = $1`, [b.id]);
      } else if (b.tipo === "local") {
        await p.query(`DELETE FROM midia_locais WHERE id = $1`, [b.id]);
      } else if (b.tipo === "anunciante") {
        // Cascade vai pegar campanhas/usuarios/cobrancas via FK ON DELETE CASCADE
        await p.query(`DELETE FROM midia_contas WHERE id = $1`, [b.id]);
      }
      logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: `arquivado.excluir.${b.tipo}`, entidade: b.tipo, entidade_id: b.id });
      return NextResponse.json({ ok: true, msg: "Excluído definitivamente" });
    }

    return NextResponse.json({ ok: false, error: "acao inválida" }, { status: 400 });
  } catch (err) {
    console.error("[arquivados PATCH]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
