/**
 * POST /api/admin/imagens/recomprimir
 *
 * Master only. Dispara re-compressão em lote de imagens já enviadas.
 *
 * Body:
 *   { dryRun?: boolean = true, empresaId?: string, limit?: number = 100 }
 *
 * Cuidado: operação síncrona e potencialmente longa. Limite default conservador.
 * Para grandes volumes, prefira rodar o script via SSH:
 *   docker exec -it cardapio_app npx tsx scripts/recomprimir-imagens.ts --apply
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";
import { recomprimirTudo } from "@/lib/media/recompress";

const bodySchema = z.object({
  dryRun:    z.boolean().default(true),
  empresaId: z.string().uuid().optional(),
  limit:     z.number().int().min(1).max(500).default(100),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Apenas master");

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    const r = await recomprimirTudo(body);

    // Auditoria só quando aplicado de verdade
    if (!body.dryRun) {
      await auditLog({
        acao:       "imagens:recomprimir",
        recurso:    "imagens",
        dadosNovos: {
          total:        r.total,
          ok:           r.ok,
          bytes_antes:  r.bytes_antes,
          bytes_depois: r.bytes_depois,
          empresaId:    body.empresaId,
          limit:        body.limit,
        },
        usuario:    { sub: auth.payload.sub, empresaId: undefined },
      });
    }

    return ok({
      dryRun: body.dryRun,
      total:  r.total,
      ok:     r.ok,
      skipped: r.skipped,
      error:  r.error,
      bytes_antes:  r.bytes_antes,
      bytes_depois: r.bytes_depois,
      economia_pct: r.bytes_antes > 0
        ? Math.round((1 - r.bytes_depois / r.bytes_antes) * 100)
        : 0,
      itens: r.itens.slice(0, 100), // não devolve lista enorme
    });
  } catch (err) {
    console.error("[Admin/Imagens/Recomprimir]", err);
    return serverError();
  }
}
