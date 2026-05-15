/**
 * POST /api/ifood/reimportar
 *   Header: x-cron-secret OU sessão master
 *   Body: { empresaId? }
 *
 * Reimporta pedidos PLC/PLACED que ficaram em ifood_eventos com
 * processado_em=NULL (eventos que chegaram pelo polling mas não foram
 * importados — geralmente porque o code não era reconhecido na época).
 *
 * Para cada evento pendente:
 *   1. Busca order detail direto na API do iFood pelo pedido_ifood_id
 *   2. Chama importarPedidoIfood
 *   3. Marca processado_em=NOW()
 *
 * Útil pra recuperar pedidos perdidos após bugs de mapeamento de codes.
 */
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { getIfoodConfig, getOrderDetail } from "@/lib/ifood/client";
import { importarPedidoIfood } from "@/lib/ifood/import-pedido";

const CODES_PLACED = ["PLC", "PLACED"];

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get("x-cron-secret");
  const isCron = secret && headerSecret === secret;
  if (!isCron) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let empresaIdFiltro: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    empresaIdFiltro = body.empresaId;
  } catch { /* */ }

  // Lista eventos pendentes
  const eventos = await query<{
    id:                string;
    empresa_id:        string;
    evento_id:         string;
    tipo:              string;
    pedido_ifood_id:   string | null;
  }>(
    `SELECT id, empresa_id, evento_id, tipo, pedido_ifood_id
       FROM ifood_eventos
      WHERE tipo = ANY($1::text[])
        AND processado_em IS NULL
        AND pedido_ifood_id IS NOT NULL
        ${empresaIdFiltro ? "AND empresa_id = $2" : ""}
      ORDER BY recebido_em ASC
      LIMIT 100`,
    empresaIdFiltro ? [CODES_PLACED, empresaIdFiltro] : [CODES_PLACED]
  );

  const resumo: Array<{ evento: string; orderId: string; ok: boolean; erro?: string }> = [];

  // Cache de cfg por empresa
  const cfgCache = new Map<string, Awaited<ReturnType<typeof getIfoodConfig>>>();

  for (const ev of eventos) {
    if (!ev.pedido_ifood_id) continue;

    try {
      let cfg = cfgCache.get(ev.empresa_id);
      if (cfg === undefined) {
        cfg = await getIfoodConfig(ev.empresa_id);
        cfgCache.set(ev.empresa_id, cfg);
      }
      if (!cfg) {
        resumo.push({ evento: ev.evento_id, orderId: ev.pedido_ifood_id, ok: false, erro: "sem config iFood" });
        continue;
      }

      const detail = await getOrderDetail(cfg, ev.pedido_ifood_id);
      if (!detail) {
        resumo.push({ evento: ev.evento_id, orderId: ev.pedido_ifood_id, ok: false, erro: "detail não encontrado (provavelmente expirado no iFood)" });
        // Marca como processado pra não ficar tentando eternamente
        await queryOne(
          `UPDATE ifood_eventos SET processado_em = NOW(), erro = 'detail expirado' WHERE id = $1`,
          [ev.id]
        ).catch(() => {});
        continue;
      }

      const r = await importarPedidoIfood(ev.empresa_id, detail);
      await queryOne(
        `UPDATE ifood_eventos SET pedido_id = $1, processado_em = NOW(), erro = NULL WHERE id = $2`,
        [r.pedido_id, ev.id]
      );

      resumo.push({ evento: ev.evento_id, orderId: ev.pedido_ifood_id, ok: true });
      console.log(`[iFood/reimportar] ✓ pedido_id=${r.pedido_id} numero=${r.numero} ja_existia=${r.ja_existia}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[iFood/reimportar] erro evento=${ev.evento_id}:`, msg);
      await queryOne(
        `UPDATE ifood_eventos SET erro = $1 WHERE id = $2`,
        [msg.slice(0, 500), ev.id]
      ).catch(() => {});
      resumo.push({ evento: ev.evento_id, orderId: ev.pedido_ifood_id, ok: false, erro: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    encontrados: eventos.length,
    importados:  resumo.filter(r => r.ok).length,
    falhas:      resumo.filter(r => !r.ok).length,
    detalhes:    resumo,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST com x-cron-secret pra reimportar pedidos iFood pendentes (PLC/PLACED com processado_em=NULL)",
  });
}
