/**
 * POST /api/painel/contratos/[id]/aceitar
 * Body: { nome: string, concordo: true }
 *
 * Registra o aceite (clickwrap) do contrato pela conta logada: data/hora, IP,
 * user-agent e nome digitado. Conforme MP 2.200-2/2001 e Lei 14.063/2020,
 * o aceite eletronico com registro de IP/timestamp tem validade juridica.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const body = await req.json().catch(() => null) as { nome?: string; concordo?: boolean } | null;
  if (!body?.concordo) return NextResponse.json({ ok: false, error: "é necessário marcar o aceite" }, { status: 400 });
  if (!body?.nome || body.nome.trim().length < 3) {
    return NextResponse.json({ ok: false, error: "informe seu nome completo para assinar" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const p = db();

    const contrato = await p.query<{ id: string; aceito: boolean }>(
      `SELECT id, aceito FROM midia_conta_contratos
        WHERE id = $1 AND conta_id = $2 AND visivel_cliente = true`,
      [params.id, auth.sub]
    ).then(r => r.rows[0]);
    if (!contrato) return NextResponse.json({ ok: false, error: "contrato não encontrado" }, { status: 404 });
    if (contrato.aceito) return NextResponse.json({ ok: false, error: "contrato já foi assinado" }, { status: 400 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "desconhecido";
    const ua = req.headers.get("user-agent") ?? "";

    await p.query(
      `UPDATE midia_conta_contratos
          SET aceito = true, aceito_em = NOW(), aceito_ip = $1,
              aceito_nome = $2, aceito_user_agent = $3
        WHERE id = $4`,
      [ip, body.nome.trim(), ua, params.id]
    );

    return NextResponse.json({ ok: true, aceito_em: new Date().toISOString() });
  } catch (err) {
    console.error("[painel/contratos aceitar]", err);
    return NextResponse.json({ ok: false, error: "erro ao registrar aceite" }, { status: 500 });
  }
}
