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
import { gerarMensalidadeMes, gerarMensalidadeRede, enviarEmailFatura } from "@/lib/billing/mensalidades";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    // 1. Gera mensalidades por REDE (uma fatura unificada na matriz)
    const redes = await query<{ id: string; nome: string }>(
      `SELECT id, nome FROM redes
        WHERE deleted_at IS NULL
          AND plano_id IS NOT NULL`
    ).catch(() => []);

    const hoje = new Date();
    const mesRef = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    let redes_geradas = 0, redes_existentes = 0, redes_erros = 0;
    let geradas = 0, ja_existentes = 0, sem_plano = 0, erros = 0, emails_enviados = 0;

    // ── Mensalidades por rede ──
    for (const r of redes) {
      const result = await gerarMensalidadeRede(r.id, mesRef);
      if (result.id) {
        if (result.criada) redes_geradas++;
        else redes_existentes++;
      } else {
        redes_erros++;
        console.warn(`[Cron/Rede] rede ${r.nome}: ${result.mensagem}`);
      }
    }

    // 2. Gera mensalidades pra empresas STANDALONE (sem rede_id)
    //    e pra filiais de redes SEM plano configurado (fallback individual)
    const empresas = await query<{
      id: string; nome_fantasia: string; email: string | null; plano_id: string | null;
    }>(
      `SELECT e.id, e.nome_fantasia, e.email, e.plano_id
         FROM empresas e
         LEFT JOIN redes r ON r.id = e.rede_id AND r.deleted_at IS NULL
        WHERE e.status IN ('ativo', 'ativa', 'teste')
          AND e.deleted_at IS NULL
          AND e.plano_id IS NOT NULL
          -- Pula filiais de redes COM plano (já cobertas acima)
          AND (e.rede_id IS NULL OR r.plano_id IS NULL)`
    );

    for (const emp of empresas) {
      const r = await gerarMensalidadeMes(emp, mesRef);
      if (r.id) {
        if (r.criada) {
          geradas++;
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

    console.info(
      `[Cron/GerarMensalidades] Redes: ${redes_geradas} geradas, ${redes_existentes} existentes, ${redes_erros} erros · ` +
      `Empresas standalone: ${geradas} geradas, ${ja_existentes} existentes, ${sem_plano} sem plano, ${erros} erros, ${emails_enviados} emails`
    );
    return NextResponse.json({
      ok: true,
      redes: { geradas: redes_geradas, ja_existentes: redes_existentes, erros: redes_erros },
      empresas: { geradas, ja_existentes, sem_plano, erros, emails_enviados },
    });
  } catch (err) {
    console.error("[Cron/GerarMensalidades]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, cron: "gerar-mensalidades" });
}
