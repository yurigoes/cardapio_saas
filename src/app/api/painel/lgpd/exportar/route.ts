/**
 * GET /api/painel/lgpd/exportar
 *
 * LGPD Art. 18 V — Portabilidade dos dados.
 * Exporta TUDO da empresa (usuários, produtos, pedidos, clientes, etc)
 * como JSON. Devolve como download .json.gz.
 */
import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "zlib";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { forbidden } from "@/lib/utils/response";

const TABELAS = [
  "usuarios", "categorias", "produtos", "mesas", "clientes",
  "pedidos", "pedido_itens", "pedido_pagamentos",
  "caixas", "caixa_movimentos", "estoque_movimentos",
  "vales", "comandas", "cupons",
  "impressoras", "print_agents",
];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master", "admin"].includes(auth.payload.role)) {
    return forbidden("Apenas master/admin podem exportar dados");
  }
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden("Empresa não identificada");

  try {
    const dump: Record<string, unknown> = {
      exportado_em: new Date().toISOString(),
      empresa_id:   empresaId,
      tabelas:      {},
    };
    const tabelasObj = dump.tabelas as Record<string, unknown[]>;

    for (const tabela of TABELAS) {
      try {
        const rows = await query(
          `SELECT * FROM ${tabela} WHERE empresa_id = $1`,
          [empresaId]
        );
        tabelasObj[tabela] = rows;
      } catch {
        tabelasObj[tabela] = [];
      }
    }

    const json = JSON.stringify(dump, null, 2);
    const gz = gzipSync(json);

    return new NextResponse(gz, {
      status: 200,
      headers: {
        "Content-Type":        "application/gzip",
        "Content-Disposition": `attachment; filename="cardapio-export-${empresaId.slice(0, 8)}-${Date.now()}.json.gz"`,
      },
    });
  } catch (err) {
    console.error("[LGPD/Exportar]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
