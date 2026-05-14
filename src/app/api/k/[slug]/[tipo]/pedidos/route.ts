/**
 * GET /api/k/[slug]/[tipo]/pedidos?t=kio_xxx
 *
 * Endpoint público pra painéis kiosk (cozinha/tv/delivery).
 * Auth: token kio_xxx no query string OU header X-Kiosk-Token.
 *
 * Retorna pedidos da empresa filtrados conforme o tipo:
 *   cozinha  → status IN (confirmado, preparando) últimas 12h
 *   tv       → status IN (pronto) das últimas 4h
 *   delivery → tipo = 'delivery' status IN (pronto, em_rota) das últimas 4h
 */
import { NextRequest, NextResponse } from "next/server";
import { validarKioskToken } from "@/lib/auth/kiosk";
import { query } from "@/lib/db/client";

const FILTROS: Record<string, { status: string[]; tipos?: string[]; horas: number }> = {
  cozinha:  { status: ["confirmado", "preparando", "preparo"], horas: 12 },
  tv:       { status: ["pronto", "preparando"],                horas: 4 },
  delivery: { status: ["pronto", "em_rota", "saiu_entrega"], tipos: ["delivery"], horas: 4 },
};

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; tipo: string } }
) {
  const ctx = await validarKioskToken(req, params.slug, params.tipo);
  if (!ctx) return NextResponse.json({ ok: false, error: "kiosk token inválido" }, { status: 401 });

  const filtro = FILTROS[params.tipo];
  if (!filtro) return NextResponse.json({ ok: false, error: "tipo desconhecido" }, { status: 400 });

  try {
    const conds: string[] = [
      `p.empresa_id = $1`,
      `p.deleted_at IS NULL`,
      `p.created_at >= NOW() - INTERVAL '${filtro.horas} hours'`,
      `p.status = ANY($2::text[])`,
    ];
    const vals: unknown[] = [ctx.empresaId, filtro.status];
    if (filtro.tipos) {
      conds.push(`p.tipo = ANY($3::text[])`);
      vals.push(filtro.tipos);
    }

    const pedidos = await query(
      `SELECT p.id, p.numero, p.tipo, p.status, p.total, p.created_at,
              p.cliente_nome, p.observacoes,
              m.numero AS mesa_numero,
              EXTRACT(EPOCH FROM (NOW() - p.created_at))::int AS tempo_espera_seg
         FROM pedidos p
         LEFT JOIN mesas m ON m.id = p.mesa_id
        WHERE ${conds.join(" AND ")}
        ORDER BY p.created_at ASC`,
      vals
    );

    return NextResponse.json({ ok: true, pedidos, ctx: { tipo: ctx.tipo, slug: ctx.slug } });
  } catch (err) {
    console.error("[Kiosk/Pedidos]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
