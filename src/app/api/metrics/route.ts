/**
 * GET /api/metrics
 *
 * Endpoint Prometheus — formato text/plain. Protegido por header
 * `Authorization: Bearer <METRICS_TOKEN>` ou query param `?token=...`.
 *
 * Configurar Prometheus scraper:
 *   - job_name: cardapio_saas
 *   - metrics_path: /api/metrics
 *   - bearer_token: <METRICS_TOKEN>
 *   - scrape_interval: 30s
 */
import { NextRequest, NextResponse } from "next/server";
import { registry, refreshGauges } from "@/lib/observability/metrics";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "METRICS_TOKEN não configurado no servidor" },
      { status: 500 }
    );
  }

  // Auth: header Bearer ou ?token=
  const url      = new URL(req.url);
  const queryTok = url.searchParams.get("token");
  const header   = req.headers.get("authorization") ?? "";
  const headerTok = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (queryTok !== expected && headerTok !== expected) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  try {
    // Atualiza gauges antes de exportar
    await refreshGauges();

    const body = await registry.metrics();
    return new NextResponse(body, {
      headers: {
        "Content-Type": registry.contentType,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("[metrics] export error:", err);
    return new NextResponse("error", { status: 500 });
  }
}
