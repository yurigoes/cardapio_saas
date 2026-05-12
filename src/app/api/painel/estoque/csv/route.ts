/**
 * GET /api/painel/estoque/csv?tipo=inventario|movimentos&from=&to=
 *
 * Exporta CSV do estoque para conciliação contábil/auditoria.
 *   - inventario:  snapshot atual (1 linha por produto controlado)
 *   - movimentos:  histórico de movimentos no período
 *
 * Encoding: UTF-8 com BOM (Excel BR abre direito)
 * Separador: ; (Excel BR padrão)
 * Decimal:   , (formato BR)
 * Datas:     DD/MM/YYYY HH:MM
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { forbidden, badRequest, serverError } from "@/lib/utils/response";

const BOM = "﻿";

function fmtBRDecimal(n: number | string | null) {
  if (n == null) return "";
  return Number(n).toFixed(2).replace(".", ",");
}
function fmtBRDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function csvEscape(v: unknown) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(";") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
}
function csvRow(cells: unknown[]) {
  return cells.map(csvEscape).join(";") + "\r\n";
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "estoque:ver")) return forbidden();

  const sp   = req.nextUrl.searchParams;
  const tipo = (sp.get("tipo") ?? "inventario") as "inventario" | "movimentos";
  const from = sp.get("from") ?? new Date().toISOString().slice(0, 10);
  const to   = sp.get("to")   ?? new Date().toISOString().slice(0, 10);

  if (tipo !== "inventario" && tipo !== "movimentos") {
    return badRequest("tipo deve ser 'inventario' ou 'movimentos'");
  }

  try {
    let csv = BOM;
    let filename: string;

    if (tipo === "inventario") {
      filename = `inventario_${new Date().toISOString().slice(0, 10)}.csv`;
      csv += csvRow([
        "Produto", "Categoria", "Preço Custo (R$)", "Preço Venda (R$)",
        "Estoque Atual", "Estoque Mínimo", "Status", "Valor Custo Total (R$)",
      ]);

      const rows = await query<{
        nome: string; categoria_nome: string | null;
        preco: string; preco_custo: string | null;
        estoque_atual: number | null; estoque_minimo: number | null;
      }>(
        `SELECT p.nome, c.nome AS categoria_nome,
                p.preco, p.preco_custo,
                p.estoque_atual, p.estoque_minimo
         FROM produtos p
         LEFT JOIN categorias c ON c.id = p.categoria_id
         WHERE p.empresa_id = $1 AND p.deleted_at IS NULL
           AND p.controla_estoque = TRUE
         ORDER BY c.nome NULLS LAST, p.nome`,
        [empresaId]
      );

      for (const r of rows) {
        const atual = r.estoque_atual ?? 0;
        const min   = r.estoque_minimo ?? 0;
        const status = atual > min ? "OK" : atual <= 0 ? "ZERADO" : "BAIXO";
        const custoTotal = r.preco_custo != null ? Number(r.preco_custo) * atual : null;
        csv += csvRow([
          r.nome, r.categoria_nome ?? "",
          fmtBRDecimal(r.preco_custo),
          fmtBRDecimal(r.preco),
          atual, min, status,
          fmtBRDecimal(custoTotal),
        ]);
      }
    } else {
      // tipo === "movimentos"
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return badRequest("Datas inválidas (esperado YYYY-MM-DD)");
      }
      filename = `estoque_movimentos_${from}_a_${to}.csv`;
      csv += csvRow([
        "Data/Hora", "Produto", "Tipo", "Quantidade",
        "Estoque Anterior", "Estoque Atual", "Pedido", "Operador", "Motivo",
      ]);

      const rows = await query<{
        criado_em: string; produto_nome: string;
        tipo: string; quantidade: number;
        estoque_anterior: number | null; estoque_atual: number | null;
        pedido_numero: number | null; usuario_nome: string | null;
        motivo: string | null;
      }>(
        `SELECT m.criado_em, p.nome AS produto_nome,
                m.tipo, m.quantidade,
                m.estoque_anterior, m.estoque_atual,
                ped.numero AS pedido_numero,
                u.nome AS usuario_nome,
                m.motivo
         FROM estoque_movimentos m
         LEFT JOIN produtos p   ON p.id   = m.produto_id
         LEFT JOIN pedidos  ped ON ped.id = m.pedido_id
         LEFT JOIN usuarios u   ON u.id   = m.usuario_id
         WHERE m.empresa_id = $1
           AND m.criado_em >= $2::date
           AND m.criado_em < ($3::date + INTERVAL '1 day')
         ORDER BY m.criado_em DESC`,
        [empresaId, from, to]
      );

      for (const r of rows) {
        const sinal = (r.tipo === "saida" || r.tipo === "perda") ? "-" : "+";
        csv += csvRow([
          fmtBRDateTime(r.criado_em),
          r.produto_nome ?? "",
          r.tipo,
          sinal + r.quantidade,
          r.estoque_anterior ?? "",
          r.estoque_atual ?? "",
          r.pedido_numero ?? "",
          r.usuario_nome ?? "",
          r.motivo ?? "",
        ]);
      }
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control":       "no-store",
      },
    });
  } catch (err) {
    console.error("[Estoque/CSV]", err);
    return serverError();
  }
}
