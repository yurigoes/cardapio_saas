/**
 * POST /api/admin/locais/[id]/sync-relogio?key=CRON_SECRET (ou cookie master)
 *
 * Forca todas as TVs do local a re-sincronizar relogio via NTP nativo do Android.
 * Essencial pra ponta_gondola tocar anuncios em sync entre TVs.
 *
 * Tambem dispara collectNow logo apos pra a programacao ser revalidada.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { sincronizarRelogioDoLocal } from "@/lib/sync-relogio";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest, { params }: { params: { id: string } }) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const cronSecret = process.env.CRON_SECRET ?? "";
  const viaKey = cronSecret && key === cronSecret;
  if (!viaKey && !(await exigirMaster(req))) {
    return NextResponse.json({ ok: false, error: "apenas master (ou ?key=CRON_SECRET)" }, { status: 403 });
  }

  const r = await sincronizarRelogioDoLocal(params.id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro, commandId: r.commandId }, { status: 500 });
  return NextResponse.json({ ok: true, commandId: r.commandId });
}

export const POST = handle;
export const GET = handle;
