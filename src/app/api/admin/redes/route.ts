/**
 * GET  /api/admin/redes        — lista redes (master)
 * POST /api/admin/redes        — cria nova rede
 *   Body: { nome, cnpj_matriz?, fidelidade_cross_filial?, ... }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master" && auth.payload.role !== "suporte") return forbidden();

  try {
    const rows = await query(
      `SELECT r.id, r.nome, r.cnpj_matriz, r.logo_url, r.cor_primaria,
              r.fidelidade_cross_filial, r.cardapio_sincronizado,
              r.desconto_progressivo_pct, r.plano_id, p.nome AS plano_nome,
              r.created_at,
              (SELECT COUNT(*) FROM empresas e WHERE e.rede_id = r.id AND e.deleted_at IS NULL) AS qtd_filiais
         FROM redes r
         LEFT JOIN planos p ON p.id = r.plano_id
        WHERE r.deleted_at IS NULL
        ORDER BY r.created_at DESC`
    );
    return ok(rows);
  } catch (err) {
    console.error("[Admin/Redes/GET]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

const schema = z.object({
  nome:                     z.string().min(2).max(120),
  cnpj_matriz:              z.string().max(18).optional().nullable(),
  razao_social:             z.string().max(200).optional().nullable(),
  cor_primaria:             z.string().max(20).optional().nullable(),
  fidelidade_cross_filial:  z.boolean().optional(),
  cardapio_sincronizado:    z.boolean().optional(),
  plano_id:                 z.string().uuid().optional().nullable(),
  desconto_progressivo_pct: z.number().min(0).max(100).optional(),
  email_contato:            z.string().email().optional().nullable(),
  whatsapp:                 z.string().max(20).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const r = await queryOne<{ id: string }>(
      `INSERT INTO redes
         (nome, cnpj_matriz, razao_social, cor_primaria,
          fidelidade_cross_filial, cardapio_sincronizado,
          plano_id, desconto_progressivo_pct, email_contato, whatsapp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [body.nome, body.cnpj_matriz ?? null, body.razao_social ?? null,
       body.cor_primaria ?? "#10b981",
       body.fidelidade_cross_filial ?? false,
       body.cardapio_sincronizado ?? true,
       body.plano_id ?? null, body.desconto_progressivo_pct ?? 0,
       body.email_contato ?? null, body.whatsapp ?? null]
    );
    return created({ id: r?.id });
  } catch (err) {
    console.error("[Admin/Redes/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
