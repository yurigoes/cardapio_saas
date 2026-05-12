/**
 * GET /api/painel/relatorio/financeiro/csv?from=&to=&tipo=pedidos|caixa
 *
 * Exporta CSV do período. Dois formatos:
 *   - tipo=pedidos: 1 linha por pedido (data, número, cliente, total, forma...)
 *   - tipo=caixa:   1 linha por movimento de caixa (sangria/reforço/venda/estorno)
 *
 * Encoding: UTF-8 com BOM (Excel BR abre corretamente)
 * Separador: ; (Excel BR usa vírgula como separador decimal)
 * Decimal:   , (formato BR)
 *
 * Headers HTTP forçam download como anexo com nome contextualizado.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { forbidden, badRequest, serverError } from "@/lib/utils/response";

const BOM = "﻿";

function fmtBRDecimal(n: number | string): string {
  return Number(n).toFixed(2).replace(".", ",");
}

function fmtBRDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Escapa um valor para uma célula CSV.
 *  Adiciona aspas se contém ;, " ou quebra de linha; duplica aspas internas. */
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(";") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvEscape).join(";") + "\r\n";
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "financeiro:ver")) return forbidden();

  const sp   = req.nextUrl.searchParams;
  const from = sp.get("from") ?? new Date().toISOString().slice(0, 10);
  const to   = sp.get("to")   ?? new Date().toISOString().slice(0, 10);
  const tipo = (sp.get("tipo") ?? "pedidos") as "pedidos" | "caixa";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return badRequest("Datas inválidas (esperado YYYY-MM-DD)");
  }
  if (tipo !== "pedidos" && tipo !== "caixa") {
    return badRequest("tipo deve ser 'pedidos' ou 'caixa'");
  }

  try {
    let csv = BOM;
    let filename: string;

    if (tipo === "pedidos") {
      filename = `pedidos_${from}_a_${to}.csv`;
      csv += csvRow([
        "Data/Hora", "Número", "Tipo", "Status",
        "Cliente", "Telefone",
        "Subtotal", "Desconto", "Taxa Entrega", "Total",
        "Forma Pagamento", "Cupom",
        "Mesa", "Comanda",
      ]);

      const rows = await query<{
        criado_em:        string;
        numero:           number;
        tipo:             string;
        status:           string;
        cliente_nome:     string | null;
        cliente_telefone: string | null;
        subtotal:         string;
        desconto:         string;
        taxa_entrega:     string;
        total:            string;
        forma_pagamento:  string | null;
        cupom_codigo:     string | null;
        mesa_numero:      number | null;
        comanda:          string | null;
      }>(
        `SELECT p.created_at AS criado_em,
                p.numero, p.tipo, p.status,
                p.cliente_nome, p.cliente_telefone,
                p.subtotal, p.desconto,
                COALESCE(p.taxa_entrega, 0) AS taxa_entrega,
                p.total,
                p.forma_pagamento,
                c.codigo AS cupom_codigo,
                m.numero AS mesa_numero,
                p.comanda
         FROM pedidos p
         LEFT JOIN cupons c ON c.id = p.cupom_id
         LEFT JOIN mesas  m ON m.id = p.mesa_id
         WHERE p.empresa_id = $1
           AND p.created_at >= $2::date
           AND p.created_at < ($3::date + INTERVAL '1 day')
           AND p.deleted_at IS NULL
         ORDER BY p.created_at DESC`,
        [empresaId, from, to]
      );

      for (const r of rows) {
        csv += csvRow([
          fmtBRDateTime(r.criado_em),
          r.numero,
          r.tipo,
          r.status,
          r.cliente_nome ?? "",
          r.cliente_telefone ?? "",
          fmtBRDecimal(r.subtotal),
          fmtBRDecimal(r.desconto),
          fmtBRDecimal(r.taxa_entrega),
          fmtBRDecimal(r.total),
          r.forma_pagamento ?? "",
          r.cupom_codigo ?? "",
          r.mesa_numero ?? "",
          r.comanda ?? "",
        ]);
      }
    } else {
      // tipo === "caixa"
      filename = `movimentos_caixa_${from}_a_${to}.csv`;
      csv += csvRow([
        "Data/Hora", "Caixa ID", "Tipo Movimento", "Forma Pagamento",
        "Valor", "Descrição", "Pedido Número", "Operador",
      ]);

      const rows = await query<{
        criado_em:       string;
        caixa_id:        string;
        tipo:            string;
        forma_pagamento: string | null;
        valor:           string;
        descricao:       string | null;
        pedido_numero:   number | null;
        operador:        string | null;
      }>(
        `SELECT m.criado_em, m.caixa_id, m.tipo, m.forma_pagamento, m.valor, m.descricao,
                p.numero AS pedido_numero,
                u.nome   AS operador
         FROM caixa_movimentos m
         LEFT JOIN pedidos  p ON p.id = m.pedido_id
         LEFT JOIN usuarios u ON u.id = m.usuario_id
         WHERE m.empresa_id = $1
           AND m.criado_em >= $2::date
           AND m.criado_em < ($3::date + INTERVAL '1 day')
         ORDER BY m.criado_em DESC`,
        [empresaId, from, to]
      );

      for (const r of rows) {
        // Sinal: positivo (+) para venda/reforço, negativo (−) para sangria/estorno
        const sinal = (r.tipo === "sangria" || r.tipo === "estorno") ? "-" : "+";
        csv += csvRow([
          fmtBRDateTime(r.criado_em),
          r.caixa_id.slice(0, 8),
          r.tipo,
          r.forma_pagamento ?? "",
          sinal + fmtBRDecimal(r.valor),
          r.descricao ?? "",
          r.pedido_numero ?? "",
          r.operador ?? "",
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
    console.error("[Relatorio/CSV]", err);
    return serverError();
  }
}
