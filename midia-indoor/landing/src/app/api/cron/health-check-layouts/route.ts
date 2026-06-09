/**
 * GET/POST /api/cron/health-check-layouts?key=CRON_SECRET
 *
 * Varre todas as campanhas no_ar (e aprovada com xibo_layout_id) e verifica se
 * o Layout ainda existe no Xibo. Se sumiu:
 *   1. Tenta soft-recreate (se tem backup BYTEA da arte)
 *   2. Se nao tem backup, limpa as refs e marca arte_status='pendente'
 *      (anunciante recebe alerta na proxima abertura do painel + email opcional)
 *
 * Roda diariamente (sugestao: 03:00 UTC). Garante que problemas de drift
 * Xibo↔DB sao detectados ANTES do anunciante tentar lancar de novo.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { obterCampaignIdDoLayout } from "@/lib/xibo";
import { recriarArteNoXibo } from "@/lib/campanhas";

export const dynamic = "force-dynamic";

interface ResultadoLinha {
  campanhaId: string;
  nome: string;
  layoutId: number;
  status: "ok" | "recriado" | "sem_backup" | "erro";
  novoLayoutId?: number;
  erro?: string;
}

async function handle(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || key !== secret) {
    return NextResponse.json({ ok: false, error: "não autorizado" }, { status: 401 });
  }

  try {
    await ensureSchema();

    // Pega TODAS as campanhas que tem xibo_layout_id setado (no_ar, aprovada, pausada, etc).
    // Inclui encerradas? Nao — encerradas nao precisam de health-check.
    const candidatas = await db().query<{ id: string; nome: string; xibo_layout_id: number; conta_id: string }>(
      `SELECT id, nome, xibo_layout_id, conta_id
         FROM midia_campanhas
        WHERE xibo_layout_id IS NOT NULL
          AND status IN ('no_ar', 'aguardando_arte', 'aguardando_lancamento', 'pausada')`
    ).then(r => r.rows);

    const resultados: ResultadoLinha[] = [];
    for (const c of candidatas) {
      try {
        const layoutCampaignId = await obterCampaignIdDoLayout(c.xibo_layout_id);
        if (layoutCampaignId !== null) {
          // Layout existe — saudavel
          continue; // nao adiciona em resultados (evita log poluente)
        }

        console.warn(`[health-check] campanha ${c.id} (${c.nome}) tem layout ${c.xibo_layout_id} orfao`);

        // Tenta soft-recreate
        const recreate = await recriarArteNoXibo(c.id);
        if (recreate.ok && recreate.layoutId) {
          resultados.push({
            campanhaId: c.id, nome: c.nome, layoutId: c.xibo_layout_id,
            status: "recriado", novoLayoutId: recreate.layoutId,
          });
        } else {
          // Sem backup ou erro — limpa refs
          await db().query(
            `UPDATE midia_campanhas
                SET xibo_layout_id = NULL, xibo_media_id = NULL,
                    arte_status = 'pendente',
                    status = CASE WHEN status = 'no_ar' THEN 'pausada' ELSE status END,
                    updated_at = NOW()
              WHERE id = $1`,
            [c.id]
          );
          resultados.push({
            campanhaId: c.id, nome: c.nome, layoutId: c.xibo_layout_id,
            status: "sem_backup", erro: recreate.erro,
          });
        }
      } catch (e) {
        resultados.push({
          campanhaId: c.id, nome: c.nome, layoutId: c.xibo_layout_id,
          status: "erro", erro: (e as Error).message,
        });
      }
    }

    // Conta resumo
    const total = candidatas.length;
    const recriadas = resultados.filter(r => r.status === "recriado").length;
    const semBackup = resultados.filter(r => r.status === "sem_backup").length;
    const erros = resultados.filter(r => r.status === "erro").length;
    const saudaveis = total - recriadas - semBackup - erros;

    console.log(`[health-check-layouts] total=${total} saudaveis=${saudaveis} recriadas=${recriadas} sem_backup=${semBackup} erros=${erros}`);

    // E-mail de alerta pro master se houver "sem_backup" (precisa reupload manual)
    if (semBackup > 0) {
      try {
        const { enviarAlertaMaster } = await import("@/lib/email");
        const linhasSemBackup = resultados.filter(r => r.status === "sem_backup");
        const linhas = linhasSemBackup.map(r =>
          `<li><strong>${r.nome}</strong> &mdash; camp <code>${r.campanhaId.slice(0, 8)}</code>, layout <code>${r.layoutId}</code></li>`
        ).join("");
        await enviarAlertaMaster({
          assunto: `Health-check: ${semBackup} campanha(s) precisam de reupload de arte`,
          conteudoHtml: `
            <p>O health-check diário detectou <strong>${semBackup} campanha(s)</strong> com Layout removido do Xibo
            e <strong>sem backup local da arte</strong>. Os anunciantes precisam reenviar:</p>
            <ul>${linhas}</ul>
            <p style="margin-top:18px;color:#6b7280;font-size:13px;">
              Resumo: ${saudaveis} saudáveis · ${recriadas} recriadas automaticamente · ${semBackup} sem backup · ${erros} erros.
            </p>`,
        });
      } catch (e) { console.warn("[health-check] email alerta falhou:", (e as Error).message); }
    }

    return NextResponse.json({
      ok: true,
      total, saudaveis, recriadas, sem_backup: semBackup, erros,
      detalhes: resultados, // so as anomalias (saudaveis nao entram)
    });
  } catch (err) {
    console.error("[health-check-layouts]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
