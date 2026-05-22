/**
 * GET /api/planos — planos ativos (público, usado pela landing/cadastro).
 */
import { NextResponse } from "next/server";
import { listarPlanosAtivos } from "@/lib/planos-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const planos = await listarPlanosAtivos();
    return NextResponse.json({ ok: true, planos });
  } catch {
    return NextResponse.json({ ok: false, planos: [] }, { status: 500 });
  }
}
