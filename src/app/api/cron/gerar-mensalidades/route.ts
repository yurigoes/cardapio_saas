/**
 * POST /api/cron/gerar-mensalidades
 *
 * Cron mensal (rodar dia 1) — gera mensalidade do mês corrente pra cada
 * empresa ativa+teste. Idempotente (UNIQUE constraint).
 *
 * Auth: header x-cron-secret.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { gerarMensalidadeMes, enviarEmailFatura } from "@/lib/billing/mensalidades";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const empresas = await query<{
      id: string; nome_fantasia: string; email: string | null; plano_id: string | null;
    }>(
      `SELECT id, nome_fantasia, email, plano_id
         FROM empresas
        WHERE status IN ('ativa', 'teste')
          AND deleted_at IS NULL
          AND plano_id IS NOT NULL`
    );

    const hoje = new Date();
    const mesRef = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    let geradas = 0, ja_existentes = 0, sem_plano = 0, erros = 0, emails_enviados = 0;

    for (const emp of empresas) {
      const r = await gerarMensalidadeMes(emp, mesRef);
      if (r.id) {
        if (r.criada) {
          geradas++;
          // Envia fatura por email best-effort
          if (emp.email) {
            const e = await enviarEmailFatura(r.id);
            if (e.ok) emails_enviados++;
          }
        } else {
          ja_existentes++;
        }
      } else {
        if (r.mensagem?.includes("plano")) sem_plano++;
        else erros++;
      }
    }

    console.info(`[Cron/GerarMensalidades] ${geradas} geradas, ${ja_existentes} já existentes, ${sem_plano} sem plano, ${erros} erros, ${emails_enviados} emails`);
    return NextResponse.json({ ok: true, geradas, ja_existentes, sem_plano, erros, emails_enviados });
  } catch (err) {
    console.error("[Cron/GerarMensalidades]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, cron: "gerar-mensalidades" });
}
