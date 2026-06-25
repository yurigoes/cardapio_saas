/**
 * GET /api/pub/terminal/disponivel/[slug]
 * Diz se a empresa tem um terminal de cartão configurado como padrão do totem
 * (ex: Cielo Smart/L400). O totem usa isso pra mostrar a opção "Cartão (maquininha)".
 *
 * Resposta: { disponivel: boolean, driver: string|null }
 */
import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db/client";
import { ok, notFound, serverError } from "@/lib/utils/response";
import { EMPRESA_OPERACIONAL_SQL } from "@/lib/billing/empresa-acesso";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL AND ${EMPRESA_OPERACIONAL_SQL}`,
      [params.slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const term = await queryOne<{ driver: string }>(
      `SELECT driver FROM empresa_terminais
        WHERE empresa_id = $1 AND padrao_totem = TRUE AND ativo = TRUE
        LIMIT 1`,
      [empresa.id]
    );

    return ok({ disponivel: !!term, driver: term?.driver ?? null });
  } catch (err) {
    console.error("[Pub/Terminal/Disponivel/GET]", err);
    return serverError();
  }
}
