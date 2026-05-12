/**
 * GET /api/painel/caixa
 *
 * Lista caixas (abertos + fechados) da empresa, do mais recente ao mais antigo.
 * Suporta paginação e filtro por status.
 *
 * Query params:
 *   page=1            limit=20
 *   status=fechado|aberto (opcional)
 *   from=YYYY-MM-DD   to=YYYY-MM-DD (opcional)
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryCount } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { forbidden, serverError, paginatedOk } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "caixa:abrir")) return forbidden();

  const sp     = req.nextUrl.searchParams;
  const page   = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit  = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10)));
  const status = sp.get("status");
  const from   = sp.get("from");
  const to     = sp.get("to");
  const offset = (page - 1) * limit;

  const conditions: string[] = ["c.empresa_id = $1"];
  const values: unknown[] = [empresaId];
  let idx = 2;

  if (status === "aberto" || status === "fechado") {
    conditions.push(`c.status = $${idx++}`);
    values.push(status);
  }
  if (from) {
    conditions.push(`c.aberto_em >= $${idx++}`);
    values.push(from);
  }
  if (to) {
    conditions.push(`c.aberto_em <= $${idx++}::date + INTERVAL '1 day'`);
    values.push(to);
  }

  const where = conditions.join(" AND ");

  try {
    const [rows, total] = await Promise.all([
      query<{
        id:                    string;
        status:                string;
        valor_abertura:        string;
        valor_esperado:        string | null;
        valor_fechamento:      string | null;
        diferenca:             string | null;
        aberto_em:             string;
        fechado_em:            string | null;
        usuario_abertura_nome: string | null;
        usuario_fechamento_nome: string | null;
        total_vendas:          string;
      }>(
        `SELECT c.id, c.status,
                c.valor_abertura, c.valor_esperado, c.valor_fechamento, c.diferenca,
                c.aberto_em, c.fechado_em,
                ua.nome AS usuario_abertura_nome,
                uf.nome AS usuario_fechamento_nome,
                COALESCE(
                  (SELECT SUM(valor) FROM caixa_movimentos m
                   WHERE m.caixa_id = c.id AND m.tipo = 'venda'),
                  0
                ) AS total_vendas
         FROM caixas c
         LEFT JOIN usuarios ua ON ua.id = c.usuario_abertura_id
         LEFT JOIN usuarios uf ON uf.id = c.usuario_fechamento_id
         WHERE ${where}
         ORDER BY c.aberto_em DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset]
      ),
      queryCount(`SELECT COUNT(*) FROM caixas c WHERE ${where}`, values),
    ]);

    const data = rows.map((r) => ({
      ...r,
      valor_abertura:   Number(r.valor_abertura),
      valor_esperado:   r.valor_esperado   != null ? Number(r.valor_esperado)   : null,
      valor_fechamento: r.valor_fechamento != null ? Number(r.valor_fechamento) : null,
      diferenca:        r.diferenca        != null ? Number(r.diferenca)        : null,
      total_vendas:     Number(r.total_vendas),
    }));

    return paginatedOk(data, total, page, limit);
  } catch (err) {
    console.error("[Caixa/Lista]", err);
    return serverError();
  }
}
