/**
 * GET  /api/painel/clientes  → lista clientes com ranking de fidelidade
 * POST /api/painel/clientes  → cria/atualiza cliente (usado pelo totem)
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne, queryCount } from "@/lib/db/client";
import { ok, created, forbidden, serverError, badRequest, paginatedOk } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master","admin","gerente"].includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;
  const { searchParams } = new URL(req.url);

  const page    = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
  const limit   = Math.min(100, parseInt(searchParams.get("limit") ?? "20"));
  const q       = searchParams.get("q") ?? "";
  const orderBy = searchParams.get("order") ?? "pontos"; // pontos | total_gasto | total_pedidos
  const offset  = (page - 1) * limit;

  const SAFE_ORDERS: Record<string, string> = {
    pontos:        "pontos DESC",
    total_gasto:   "total_gasto DESC",
    total_pedidos: "total_pedidos DESC",
    nome:          "nome ASC",
    ultimo_pedido: "ultimo_pedido_em DESC NULLS LAST",
  };
  const orderClause = SAFE_ORDERS[orderBy] ?? "pontos DESC";

  const whereExtra = q
    ? `AND (nome ILIKE $3 OR telefone ILIKE $3 OR cpf ILIKE $3 OR email ILIKE $3)`
    : "";
  const params: unknown[] = [empresaId, limit];
  if (q) params.push(`%${q}%`);

  try {
    const countParams: unknown[] = [empresaId];
    if (q) countParams.push(`%${q}%`);

    const total = await queryCount(
      `SELECT COUNT(*) FROM clientes WHERE empresa_id = $1 ${whereExtra}`,
      countParams
    );

    const clientes = await query<Record<string, unknown>>(
      `SELECT
         id, nome, telefone, cpf, email,
         pontos, total_pedidos, total_gasto, ultimo_pedido_em, created_at
       FROM clientes
       WHERE empresa_id = $1 ${whereExtra}
       ORDER BY ${orderClause}
       LIMIT $2 OFFSET ${offset}`,
      params
    );

    return paginatedOk(clientes, { total, page, limit });
  } catch (err) {
    console.error("[Clientes/GET]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  // Usado pelo totem (sem auth) ou pelo admin
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  let empresaId: string | undefined;

  // Tenta auth normal primeiro
  const auth = await requireAuth(req);
  if (!isAuthError(auth)) {
    empresaId = auth.payload.empresaId;
  } else if (slug) {
    // Sem auth → precisa do slug para identificar a empresa (totem)
    const emp = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND status = 'ativo'`, [slug]
    );
    if (emp) empresaId = emp.id;
  }

  if (!empresaId) return forbidden("Empresa não identificada");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const { nome, telefone, cpf, email } = body as {
    nome?: string; telefone?: string; cpf?: string; email?: string;
  };

  if (!telefone && !cpf && !email) {
    return badRequest("Informe telefone, CPF ou e-mail para identificar o cliente");
  }

  try {
    // Busca cliente existente por telefone ou CPF
    let existing = null;
    if (cpf) {
      existing = await queryOne<{ id: string; nome: string; telefone: string; cpf: string; pontos: number }>(
        `SELECT id, nome, telefone, cpf, pontos FROM clientes WHERE empresa_id = $1 AND cpf = $2`,
        [empresaId, cpf]
      );
    }
    if (!existing && telefone) {
      existing = await queryOne<{ id: string; nome: string; telefone: string; cpf: string; pontos: number }>(
        `SELECT id, nome, telefone, cpf, pontos FROM clientes WHERE empresa_id = $1 AND telefone = $2`,
        [empresaId, telefone]
      );
    }

    if (existing) {
      // Atualiza nome se fornecido
      if (nome && nome !== existing.nome) {
        await queryOne(
          `UPDATE clientes SET nome = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
          [nome, existing.id]
        );
      }
      return ok({ ...existing, nome: nome || existing.nome, encontrado: true });
    }

    // Cria novo cliente
    const novo = await queryOne<{ id: string; pontos: number }>(
      `INSERT INTO clientes (empresa_id, nome, telefone, cpf, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, pontos`,
      [empresaId, nome || null, telefone || null, cpf || null, email || null]
    );

    return created({ ...novo, nome, telefone, cpf, email, encontrado: false });
  } catch (err) {
    console.error("[Clientes/POST]", err);
    return serverError();
  }
}
