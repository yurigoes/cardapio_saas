/**
 * GET /api/pub/painel/[slug]
 * Retorna os últimos 20 chamados do painel de TV para uma empresa.
 * Rota pública — sem autenticação (o painel TV fica em tela cheia sem login).
 */
import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { ok, notFound, serverError } from "@/lib/utils/response";
import { EMPRESA_OPERACIONAL_SQL } from "@/lib/billing/empresa-acesso";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL AND ${EMPRESA_OPERACIONAL_SQL}`,
      [params.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const chamados = await query<{
      id:           string;
      numero:       number;
      cliente_nome: string | null;
      balcao:       string | null;
      status:       string;
      chamado_em:   string;
    }>(
      `SELECT id, numero, cliente_nome, balcao, status, chamado_em::text
       FROM chamados_painel
       WHERE empresa_id = $1
       ORDER BY chamado_em DESC
       LIMIT 20`,
      [empresa.id]
    );

    return ok({ chamados });
  } catch (err) {
    console.error("[Pub/Painel/GET]", err);
    return serverError();
  }
}
