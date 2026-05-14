/**
 * GET /api/pub/versao
 * Versões do sistema + agentes ativos. Pra footer das páginas.
 */
import { queryOne } from "@/lib/db/client";
import { NextResponse } from "next/server";
import packageJson from "../../../../../package.json";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  let printAgent: string | null = null;
  let vpsAgent:   string | null = null;

  try {
    const r = await queryOne<{ versao: string }>(
      `SELECT versao FROM print_agents
        WHERE ativo = true AND versao IS NOT NULL
          AND ultimo_ping > NOW() - INTERVAL '5 minutes'
        ORDER BY ultimo_ping DESC LIMIT 1`
    );
    printAgent = r?.versao ?? null;
  } catch {}

  try {
    const r = await queryOne<{ versao: string }>(
      `SELECT versao FROM vps_agents
        WHERE ativo = true AND versao IS NOT NULL
          AND ultimo_ping > NOW() - INTERVAL '5 minutes'
        ORDER BY ultimo_ping DESC LIMIT 1`
    );
    vpsAgent = r?.versao ?? null;
  } catch {}

  return NextResponse.json({
    success: true,
    data: {
      sistema:      (packageJson as { version?: string }).version ?? "?",
      print_agent:  printAgent,
      vps_agent:    vpsAgent,
      build_at:     process.env.BUILD_AT ?? null,
    },
  }, { headers: HEADERS });
}
