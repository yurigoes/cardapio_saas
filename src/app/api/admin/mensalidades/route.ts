/**
 * GET /api/admin/mensalidades?status=&mes=
 * Master only — lista mensalidades de TODAS empresas.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const mes    = url.searchParams.get("mes");        // YYYY-MM

  const where: string[] = ["e.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (status) { params.push(status); where.push(`m.status = $${params.length}`); }
  if (mes)    { params.push(`${mes}-01`); where.push(`m.mes_referencia = $${params.length}::date`); }

  // Query principal — se falhar por coluna NF inexistente, retry sem
  const buscar = (comNF: boolean) => {
    const nfCols = comNF
      ? `, m.nota_fiscal_url, m.nota_fiscal_nome, m.nota_fiscal_em::text`
      : `, NULL AS nota_fiscal_url, NULL AS nota_fiscal_nome, NULL AS nota_fiscal_em`;
    return query(
      `SELECT m.id, m.empresa_id, e.nome_fantasia AS empresa_nome, e.email,
              m.mes_referencia::text, m.valor::float, m.vencimento::text, m.status,
              m.pago_em, m.pago_via, m.mp_init_point, p.nome AS plano_nome
              ${nfCols}
         FROM mensalidades m
         JOIN empresas e ON e.id = m.empresa_id
    LEFT JOIN planos p   ON p.id = m.plano_id
        WHERE ${where.join(" AND ")}
        ORDER BY m.mes_referencia DESC, e.nome_fantasia
        LIMIT 500`,
      params
    );
  };

  try {
    let rows;
    try { rows = await buscar(true); }
    catch (e1) {
      console.warn("[Admin/Mensalidades/GET] retry sem NF:", e1 instanceof Error ? e1.message : e1);
      rows = await buscar(false);
    }

    const totais = await queryOne<{
      total_aberto: string; total_paga: string; total_atrasada: string;
      qtd_aberto: string; qtd_paga: string; qtd_atrasada: string;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN m.status = 'aberta'    THEN m.valor END), 0)::text AS total_aberto,
         COALESCE(SUM(CASE WHEN m.status = 'paga'      THEN m.valor END), 0)::text AS total_paga,
         COALESCE(SUM(CASE WHEN m.status = 'atrasada'  THEN m.valor END), 0)::text AS total_atrasada,
         COUNT(*) FILTER (WHERE m.status = 'aberta')::text   AS qtd_aberto,
         COUNT(*) FILTER (WHERE m.status = 'paga')::text     AS qtd_paga,
         COUNT(*) FILTER (WHERE m.status = 'atrasada')::text AS qtd_atrasada
       FROM mensalidades m
       JOIN empresas e ON e.id = m.empresa_id
       WHERE ${where.join(" AND ")}`,
      params
    ).catch(() => null);

    console.info(`[Admin/Mensalidades/GET] retornou ${rows.length} rows · filtros: status=${status ?? '-'} mes=${mes ?? '-'}`);
    return ok({ mensalidades: rows, totais });
  } catch (err) {
    console.error("[Admin/Mensalidades/GET]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

// POST /api/admin/mensalidades — cria mensalidade manualmente
const postSchema = z.object({
  empresa_id:     z.string().uuid(),
  mes_referencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-01"),
  valor:          z.number().positive().max(1_000_000),
  vencimento:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacoes:    z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof postSchema>;
  try { body = postSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const empresa = await queryOne<{ plano_id: string | null }>(
      `SELECT plano_id FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
      [body.empresa_id]
    );
    if (!empresa) return badRequest("Empresa não encontrada");

    const r = await queryOne<{ id: string; status: string; criado_em: string }>(
      `INSERT INTO mensalidades
         (empresa_id, plano_id, mes_referencia, valor, vencimento, status, observacoes, criado_por)
       VALUES ($1, $2, $3, $4, $5, 'aberta', $6, $7)
       ON CONFLICT (empresa_id, mes_referencia) DO UPDATE
         SET valor         = EXCLUDED.valor,
             vencimento    = EXCLUDED.vencimento,
             observacoes   = COALESCE(EXCLUDED.observacoes, mensalidades.observacoes),
             status        = CASE WHEN mensalidades.status = 'paga'
                                   THEN mensalidades.status
                                   ELSE 'aberta' END,
             atualizado_em = NOW()
       RETURNING id, status, criado_em::text`,
      [body.empresa_id, empresa.plano_id, body.mes_referencia, body.valor,
       body.vencimento, body.observacoes ?? null, auth.payload.sub]
    );
    console.info(`[Admin/Mensalidades/POST] criada/atualizada id=${r?.id} status=${r?.status} empresa=${body.empresa_id}`);
    return created({ id: r?.id, status: r?.status });
  } catch (err) {
    console.error("[Admin/Mensalidades/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
