/**
 * POST /api/observability/error
 *
 * Recebe erros do client-side (window.onerror, ErrorBoundary, fetch falhas).
 * Sem auth obrigatória — qualquer página pode reportar.
 * Rate-limit por IP pra evitar abuso.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/client";
import { redisIncr } from "@/lib/db/redis";

const bodySchema = z.object({
  message:    z.string().min(1).max(2000),
  stack:      z.string().max(4000).optional(),
  rota:       z.string().max(255).optional(),
  level:      z.enum(["error", "warn", "fatal"]).optional().default("error"),
  contexto:   z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Rate-limit: 30 erros/minuto por IP
  const cnt = await redisIncr(`rl:err:${ip}`, 60).catch(() => 0);
  if (cnt > 30) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    await query(
      `INSERT INTO error_log
         (level, origem, message, stack, rota,
          user_agent, ip_origem, contexto)
       VALUES ($1, 'client', $2, $3, $4, $5, $6::inet, $7::jsonb)`,
      [
        body.level,
        body.message,
        body.stack ?? null,
        body.rota ?? null,
        req.headers.get("user-agent")?.slice(0, 500) ?? null,
        ip === "unknown" ? null : ip,
        body.contexto ? JSON.stringify(body.contexto) : null,
      ]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Observability/Error]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
