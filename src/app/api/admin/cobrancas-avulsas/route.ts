/**
 * GET  /api/admin/cobrancas-avulsas?empresa_id=  → lista (opcional filtra por empresa)
 * POST /api/admin/cobrancas-avulsas              → cria cobrança avulsa manual
 *   Body: { empresa_id, nome, motivo?, valor, vencimento (YYYY-MM-DD) }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "financeiro"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  const empresaId = req.nextUrl.searchParams.get("empresa_id");
  const status    = req.nextUrl.searchParams.get("status");

  try {
    const where: string[] = ["1=1"];
    const vals: unknown[] = [];
    let i = 1;
    if (empresaId) { where.push(`empresa_id = $${i++}`); vals.push(empresaId); }
    if (status)    { where.push(`status     = $${i++}`); vals.push(status); }

    const rows = await query(
      `SELECT c.id, c.empresa_id, e.nome_fantasia AS empresa_nome,
              c.origem, c.nome, c.motivo, c.valor, c.vencimento,
              c.status, c.mp_init_point, c.pago_em, c.pago_via, c.criado_em,
              c.nota_fiscal_url, c.nota_fiscal_nome
         FROM cobrancas_avulsas c
         LEFT JOIN empresas e ON e.id = c.empresa_id
        WHERE ${where.join(" AND ")}
        ORDER BY c.criado_em DESC LIMIT 200`,
      vals
    );
    return ok(rows);
  } catch (err) {
    console.error("[CobrAv/GET]", err);
    return serverError();
  }
}

const schema = z.object({
  empresa_id: z.string().uuid(),
  nome:       z.string().min(3).max(200),
  motivo:     z.string().max(1000).optional(),
  valor:      z.number().positive().max(1_000_000),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const r = await queryOne<{ id: string }>(
      `INSERT INTO cobrancas_avulsas
         (empresa_id, origem, nome, motivo, valor, vencimento, status, criado_por)
       VALUES ($1, 'manual', $2, $3, $4, $5, 'aberta', $6)
       RETURNING id`,
      [body.empresa_id, body.nome, body.motivo ?? null, body.valor, body.vencimento, auth.payload.sub]
    );
    return created({ id: r?.id });
  } catch (err) {
    console.error("[CobrAv/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
