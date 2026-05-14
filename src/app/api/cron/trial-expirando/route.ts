/**
 * POST /api/cron/trial-expirando
 *
 * Cron diário (10h) — encontra empresas com trial expirando em 3 dias OU
 * em 1 dia e enfileira aviso por e-mail (template 'trial_expirando').
 *
 * Cada (empresa, dias_restantes) é avisado uma vez só: usa marker em
 * `email_jobs.contexto.aviso_trial_dias` pra evitar reenvio.
 *
 * Auth: header x-cron-secret.
 */
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { enfileirar as enfileirarEmail, smtpAtivo } from "@/lib/email/smtp";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!await smtpAtivo()) {
    return NextResponse.json({ ok: true, motivo: "smtp não ativo" });
  }

  try {
    let enfileirados = 0;

    for (const dias of [3, 1]) {
      // Empresas em trial cuja data_fim cai no dia X
      const empresas = await query<{
        id: string; nome_fantasia: string; email: string | null; trial_fim: string;
      }>(
        `SELECT id, nome_fantasia, email, trial_fim
           FROM empresas
          WHERE status = 'teste'
            AND deleted_at IS NULL
            AND DATE(trial_fim) = (CURRENT_DATE + INTERVAL '${dias} days')`
      );

      for (const emp of empresas) {
        if (!emp.email) continue;

        // Já avisou hoje pra essa empresa+dias?
        const jaAvisou = await queryOne<{ id: string }>(
          `SELECT id FROM email_jobs
            WHERE evento = 'trial_expirando'
              AND contexto->>'empresa_id' = $1
              AND (contexto->>'dias')::int = $2
              AND created_at > NOW() - INTERVAL '20 hours'
            LIMIT 1`,
          [emp.id, dias]
        ).catch(() => null);
        if (jaAvisou) continue;

        const r = await enfileirarEmail({
          para:    emp.email,
          evento:  "trial_expirando",
          vars: {
            empresa_nome:   emp.nome_fantasia,
            dias_restantes: dias,
            data_expira:    new Date(emp.trial_fim).toLocaleDateString("pt-BR"),
            planos_url:     `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/painel/planos`,
          },
          contexto: { empresa_id: emp.id, dias, tipo: "aviso_trial" },
        });
        if (r.jobId) enfileirados++;
      }
    }

    console.info(`[Cron/TrialExpirando] ${enfileirados} avisos enfileirados`);
    return NextResponse.json({ ok: true, enfileirados });
  } catch (err) {
    console.error("[Cron/TrialExpirando]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, cron: "trial-expirando" });
}
