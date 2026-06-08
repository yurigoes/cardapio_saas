/**
 * POST /api/publico/trial-status
 * Endpoint público pras TV boxes reportarem status do auto-reset de trial.
 * Body: { hardware_key, dias_restantes, acao_executada?: "reset"|"check"|"erro", erro? }
 *
 * Atualiza um log local + cria notificação pro master se algo der errado.
 * Pode ser chamado autenticado pelo hardware key da TV (mesma que ela usa no Xibo).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { notificar } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

const schema = z.object({
  hardware_key:   z.string().min(4),
  display_nome:   z.string().optional(),
  dias_restantes: z.coerce.number().int().optional(),
  acao_executada: z.enum(["reset", "check", "erro"]).optional(),
  erro:           z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;

  try {
    await ensureSchema();
    await db().query(`
      CREATE TABLE IF NOT EXISTS midia_trial_log (
        id BIGSERIAL PRIMARY KEY,
        hardware_key TEXT NOT NULL,
        display_nome TEXT,
        dias_restantes INTEGER,
        acao_executada TEXT,
        erro TEXT,
        ip TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    await db().query(
      `INSERT INTO midia_trial_log (hardware_key, display_nome, dias_restantes, acao_executada, erro, ip) VALUES ($1,$2,$3,$4,$5,$6)`,
      [b.hardware_key, b.display_nome ?? null, b.dias_restantes ?? null, b.acao_executada ?? null, b.erro ?? null, ip]
    );

    // Notifica o master se: erro OU dias <=2 (vai expirar)
    if (b.acao_executada === "erro" || (b.dias_restantes != null && b.dias_restantes <= 2)) {
      await notificar({
        tipo: "trial-alerta",
        titulo: b.acao_executada === "erro" ? `Erro no auto-reset: ${b.display_nome ?? b.hardware_key}` : `Trial expirando em ${b.dias_restantes}d: ${b.display_nome ?? b.hardware_key}`,
        mensagem: b.erro ?? `Hardware: ${b.hardware_key}`,
        icone: b.acao_executada === "erro" ? "❌" : "⏰",
      });
    }
    if (b.acao_executada === "reset") {
      await notificar({
        tipo: "trial-reset",
        titulo: `Trial reiniciado: ${b.display_nome ?? b.hardware_key}`,
        mensagem: "TV vai estar disponível pelos próximos 14 dias",
        icone: "✓",
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[trial-status]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Retorna histórico dos últimos resets (pra debug)
  try {
    await ensureSchema();
    await db().query(`CREATE TABLE IF NOT EXISTS midia_trial_log (id BIGSERIAL PRIMARY KEY, hardware_key TEXT, display_nome TEXT, dias_restantes INTEGER, acao_executada TEXT, erro TEXT, ip TEXT, created_at TIMESTAMPTZ DEFAULT NOW());`);
    const rows = await db().query(`SELECT * FROM midia_trial_log ORDER BY created_at DESC LIMIT 100`).then(r => r.rows);
    return NextResponse.json({ ok: true, log: rows });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
