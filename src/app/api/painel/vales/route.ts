/**
 * GET /api/painel/vales
 *   ?status=aberto|parcial|quitado|cancelado&cliente_id=&q=&page=&limit=
 *
 * Lista vales (crediário) da empresa com totais e cliente.
 *
 * POST /api/painel/vales
 *   body: { cliente_id, valor, data_vencimento?, observacoes? }
 *
 * Cria vale manualmente (sem pedido associado — adiantamento, fiado avulso).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne, queryCount } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError, paginatedOk } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  const sp        = req.nextUrl.searchParams;
  const page      = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit     = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const status    = sp.get("status");
  const clienteId = sp.get("cliente_id");
  const q         = sp.get("q");
  const offset    = (page - 1) * limit;

  const conds: string[] = ["v.empresa_id = $1"];
  const vals: unknown[] = [empresaId];
  let i = 2;

  if (status)    { conds.push(`v.status = $${i++}`);     vals.push(status); }
  if (clienteId) { conds.push(`v.cliente_id = $${i++}`); vals.push(clienteId); }
  if (q) {
    conds.push(`(c.nome ILIKE $${i} OR c.telefone ILIKE $${i})`);
    vals.push(`%${q}%`);
    i++;
  }

  const where = conds.join(" AND ");

  try {
    const [rows, total] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT v.id, v.valor, v.valor_quitado, v.status,
                v.data_vencimento, v.observacoes,
                v.pedido_id, p.numero AS pedido_numero,
                v.created_at,
                v.cliente_id,
                c.nome     AS cliente_nome,
                c.telefone AS cliente_telefone,
                COALESCE(c.limite_vale, 0)       AS limite_vale,
                COALESCE(c.saldo_vale_aberto, 0) AS saldo_vale_aberto
         FROM vales v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN pedidos  p ON p.id = v.pedido_id
         WHERE ${where}
         ORDER BY
           CASE v.status WHEN 'aberto' THEN 1 WHEN 'parcial' THEN 2
                         WHEN 'quitado' THEN 3 ELSE 4 END,
           v.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limit, offset]
      ),
      queryCount(`SELECT COUNT(*) FROM vales v
                  LEFT JOIN clientes c ON c.id = v.cliente_id
                  WHERE ${where}`, vals),
    ]);

    return paginatedOk(rows, total, page, limit);
  } catch (err) {
    console.error("[Vales/GET]", err);
    return serverError();
  }
}

const createSchema = z.object({
  cliente_id:      z.string().uuid(),
  valor:           z.number().min(0.01).max(99999.99),
  data_vencimento: z.string().datetime().optional(),
  observacoes:     z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    // Valida limite
    const cli = await queryOne<{ limite_vale: string; saldo_vale_aberto: string }>(
      `SELECT COALESCE(limite_vale, 0)       AS limite_vale,
              COALESCE(saldo_vale_aberto, 0) AS saldo_vale_aberto
         FROM clientes WHERE id = $1 AND empresa_id = $2`,
      [body.cliente_id, empresaId]
    );
    if (!cli) return badRequest("Cliente não encontrado");

    const disponivel = Number(cli.limite_vale) - Number(cli.saldo_vale_aberto);
    if (body.valor > disponivel + 0.01) {
      return badRequest(
        `Limite insuficiente. Disponível: R$ ${disponivel.toFixed(2)}`
      );
    }

    const novo = await queryOne<{ id: string }>(
      `INSERT INTO vales
         (empresa_id, cliente_id, usuario_id, valor, data_vencimento, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        empresaId, body.cliente_id, sub,
        body.valor,
        body.data_vencimento ?? null,
        body.observacoes ?? null,
      ]
    );

    await auditLog({
      acao:       "vale:criar",
      recurso:    "vales",
      recursoId:  novo?.id,
      dadosNovos: body,
      usuario:    { sub, empresaId },
    });

    return created({ id: novo?.id });
  } catch (err) {
    console.error("[Vales/POST]", err);
    return serverError();
  }
}
