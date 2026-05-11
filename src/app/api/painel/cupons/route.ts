/**
 * GET  /api/painel/cupons  → lista cupons da empresa
 * POST /api/painel/cupons  → cria novo cupom
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne, queryCount } from "@/lib/db/client";
import { ok, created, forbidden, serverError, badRequest, paginatedOk } from "@/lib/utils/response";
import crypto from "crypto";

function gerarCodigo(prefixo = "CUP"): string {
  return `${prefixo}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master","admin","gerente"].includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;
  const { searchParams } = new URL(req.url);

  const page   = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "20"));
  const q      = searchParams.get("q") ?? "";
  const ativo  = searchParams.get("ativo");
  const offset = (page - 1) * limit;

  const conditions: string[] = ["empresa_id = $1"];
  const params: unknown[] = [empresaId];
  let idx = 2;

  if (q) { conditions.push(`(codigo ILIKE $${idx} OR descricao ILIKE $${idx})`); params.push(`%${q}%`); idx++; }
  if (ativo === "true")  { conditions.push(`ativo = true`); }
  if (ativo === "false") { conditions.push(`ativo = false`); }

  const where = conditions.join(" AND ");

  try {
    const total = await queryCount(`SELECT COUNT(*) FROM cupons WHERE ${where}`, params);

    const cupons = await query<Record<string, unknown>>(
      `SELECT
         c.id, c.codigo, c.descricao, c.tipo, c.valor,
         c.uso_maximo, c.uso_atual, c.uso_por_cliente,
         c.valor_minimo_pedido,
         c.valido_de, c.valido_ate,
         c.ativo, c.created_at,
         c.cliente_id, c.pontos_resgatados,
         cl.nome as cliente_nome
       FROM cupons c
       LEFT JOIN clientes cl ON cl.id = c.cliente_id
       WHERE ${where}
       ORDER BY c.created_at DESC
       LIMIT $${idx} OFFSET ${offset}`,
      [...params, limit]
    );

    return paginatedOk(cupons, { total, page, limit });
  } catch (err) {
    console.error("[Cupons/GET]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master","admin","gerente"].includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const {
    codigo, descricao, tipo = "percentual", valor,
    uso_maximo, uso_por_cliente = 1,
    valor_minimo_pedido,
    valido_de, valido_ate,
    cliente_id, pontos_resgatados,
  } = body as {
    codigo?: string;
    descricao?: string;
    tipo?: string;
    valor?: number;
    uso_maximo?: number;
    uso_por_cliente?: number;
    valor_minimo_pedido?: number;
    valido_de?: string;
    valido_ate?: string;
    cliente_id?: string;
    pontos_resgatados?: number;
  };

  if (!valor || valor <= 0) return badRequest("Valor do cupom é obrigatório");
  if (!["percentual","fixo","frete_gratis"].includes(tipo)) return badRequest("Tipo inválido");
  if (tipo === "percentual" && valor > 100) return badRequest("Percentual não pode ser maior que 100%");

  const codigoFinal = (codigo?.trim().toUpperCase()) || gerarCodigo();

  try {
    // Se gerado por resgate de pontos, debita os pontos do cliente
    if (cliente_id && pontos_resgatados && pontos_resgatados > 0) {
      const cliente = await queryOne<{ pontos: number }>(
        `SELECT pontos FROM clientes WHERE id = $1 AND empresa_id = $2`,
        [cliente_id, empresaId]
      );
      if (!cliente) return badRequest("Cliente não encontrado");
      if (cliente.pontos < pontos_resgatados) return badRequest("Pontos insuficientes");

      await queryOne(
        `UPDATE clientes SET pontos = pontos - $1, updated_at = NOW() WHERE id = $2`,
        [pontos_resgatados, cliente_id]
      );
    }

    const cupom = await queryOne<{ id: string; codigo: string }>(
      `INSERT INTO cupons (
         empresa_id, codigo, descricao, tipo, valor,
         uso_maximo, uso_por_cliente, valor_minimo_pedido,
         valido_de, valido_ate, cliente_id, pontos_resgatados
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, codigo`,
      [
        empresaId, codigoFinal, descricao || null, tipo, valor,
        uso_maximo || null, uso_por_cliente,
        valor_minimo_pedido || null,
        valido_de || new Date().toISOString(),
        valido_ate || null,
        cliente_id || null,
        pontos_resgatados || null,
      ]
    );

    return created(cupom);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") return badRequest("Código de cupom já existe");
    console.error("[Cupons/POST]", err);
    return serverError();
  }
}
