/**
 * GET    /api/admin/whatsapp/setup  — retorna estado + QR (se nao pareado)
 * DELETE /api/admin/whatsapp/setup  — logout (desconecta WhatsApp da instancia)
 *
 * Pareamento:
 *  1. GET retorna { estado: 'connecting', qrcode: '...base64...' }
 *  2. Abra WhatsApp no celular > Aparelhos conectados > Conectar aparelho
 *  3. Escaneia o QR
 *  4. Repete GET — estado vira 'open' e qrcode some
 *  5. Pronto pra enviar!
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { obterEstadoEvolution, logoutEvolution } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const r = await obterEstadoEvolution();
  return NextResponse.json({
    ...r,
    instancia: process.env.EVOLUTION_INSTANCE ?? "three_digital",
    publico: process.env.EVOLUTION_PUBLIC_URL ?? null,
  });
}

export async function DELETE(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  return NextResponse.json(await logoutEvolution());
}
