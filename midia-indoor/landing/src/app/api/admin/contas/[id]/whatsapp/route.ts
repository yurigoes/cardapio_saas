/**
 * POST /api/admin/contas/[id]/whatsapp
 * Body: { mensagem: string, cabecalho?: string }
 *
 * Master envia WhatsApp manual pra um anunciante.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster } from "@/lib/admin-auth";
import { enviarWhatsAppParaConta } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const body = await req.json().catch(() => null) as { mensagem?: string; cabecalho?: string } | null;
  if (!body?.mensagem || body.mensagem.trim().length < 5) {
    return NextResponse.json({ ok: false, error: "mensagem obrigatoria (min 5 chars)" }, { status: 400 });
  }
  const r = await enviarWhatsAppParaConta({
    contaId: params.id, tipo: "manual",
    cabecalho: body.cabecalho,
    mensagem: body.mensagem,
  });
  return NextResponse.json(r);
}
