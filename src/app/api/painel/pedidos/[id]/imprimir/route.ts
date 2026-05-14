/**
 * POST /api/painel/pedidos/[id]/imprimir
 * Body: { tipo?: "cozinha" | "cliente" | "ambos" }
 *
 * Enfileira o cupom no agente de impressão. Sem popup.
 * Default: 'ambos' (envia tanto pra cozinha quanto cupom do cliente).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, serverError, badRequest } from "@/lib/utils/response";
import { dispatchCupomCozinha, dispatchCupomCliente } from "@/lib/print/dispatch";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let tipo = "ambos";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.tipo && ["cozinha", "cliente", "ambos"].includes(body.tipo)) {
      tipo = body.tipo;
    }
  } catch {}

  const pedido = await queryOne<{ id: string }>(
    `SELECT id FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
    [params.id, empresaId]
  );
  if (!pedido) return notFound("Pedido não encontrado");

  try {
    const resultados: { tipo: string; ok: boolean; jobs: number; setor_usado: string | null; motivo?: string }[] = [];
    if (tipo === "cozinha" || tipo === "ambos") {
      const r = await dispatchCupomCozinha(empresaId, params.id);
      resultados.push({ tipo: "cozinha", ...r });
    }
    if (tipo === "cliente" || tipo === "ambos") {
      const r = await dispatchCupomCliente(empresaId, params.id);
      resultados.push({ tipo: "cliente", ...r });
    }

    const todosOk = resultados.every(r => r.ok);
    const jobsTotal = resultados.reduce((acc, r) => acc + r.jobs, 0);
    const falhas = resultados.filter(r => !r.ok);

    return ok({
      enfileirado:  todosOk,
      tipo,
      jobs:         jobsTotal,
      detalhes:     resultados,
      mensagem:     todosOk
        ? `Cupom (${tipo}) enfileirado em ${jobsTotal} impressora(s)`
        : `Falha em: ${falhas.map(f => `${f.tipo} (${f.motivo})`).join(", ")}. Cadastre uma impressora ativa em /painel/impressoras.`,
    });
  } catch (err) {
    console.error("[Pedidos/Imprimir]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
