/** GET /api/branding — branding público (cor, logo, nome) p/ admin e painel. */
import { NextResponse } from "next/server";
import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

export async function GET() {
  const b = await getBranding();
  return NextResponse.json({ ok: true, branding: b });
}
