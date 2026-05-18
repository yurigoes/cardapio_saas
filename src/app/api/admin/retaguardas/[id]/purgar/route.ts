/**
 * POST /api/admin/retaguardas/[id]/purgar
 *   body: { slug? }  — se omitido, purga TUDO
 *
 * Comando remoto: master dispara POST /__purge na retaguarda específica.
 * Útil pra forçar refresh após mudança grande sem esperar TTL.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, badRequest, forbidden, notFound, serverError } from "@/lib/utils/response";

const schema = z.object({ slug: z.string().min(1).optional() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Acesso exclusivo master");

  const secret = process.env.RETAGUARDA_HEARTBEAT_SECRET;
  if (!secret) return badRequest("RETAGUARDA_HEARTBEAT_SECRET não configurado no master");

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json().catch(() => ({}))); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const r = await queryOne<{ dominio: string | null }>(
      `SELECT dominio FROM retaguardas WHERE id = $1`,
      [params.id]
    );
    if (!r) return notFound("Retaguarda não encontrada");
    if (!r.dominio) return badRequest("Retaguarda sem domínio público registrado");

    const url     = `https://${r.dominio}/__purge`;
    const payload = body.slug ? { slug: body.slug } : { all: true };

    const resp = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Purge-Secret": secret },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(8000),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return badRequest(`Retaguarda respondeu ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return ok({ url, request: payload, response: data });
  } catch (err) {
    console.error("[admin/retaguardas/purgar]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
