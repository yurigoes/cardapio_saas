/**
 * GET   /api/admin/vps/alertas         — config atual
 * PATCH /api/admin/vps/alertas         — atualiza
 * POST  /api/admin/vps/alertas/teste   — envia mensagem de teste
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { enviarAlertaWhatsApp } from "@/lib/security/alertas";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();
  try {
    const r = await queryOne(
      `SELECT id, whatsapp, ativo, eventos, evolution_instance,
              ultimo_envio, ultimo_status, ultimo_erro
         FROM vps_alertas_config LIMIT 1`
    );
    return ok(r ?? { whatsapp: null, ativo: false, eventos: [], evolution_instance: null });
  } catch (err) {
    console.error("[VPS/Alertas/GET]", err);
    return serverError();
  }
}

const patchSchema = z.object({
  whatsapp:           z.string().max(20).nullable().optional(),
  ativo:              z.boolean().optional(),
  eventos:            z.array(z.string()).optional(),
  evolution_instance: z.string().max(100).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof patchSchema>;
  try { body = patchSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    // Upsert no singleton (1 registro só)
    const existing = await queryOne<{ id: string }>(`SELECT id FROM vps_alertas_config LIMIT 1`);
    if (existing) {
      const sets: string[] = ["updated_at = NOW()"];
      const vals: unknown[] = [];
      let i = 1;
      if (body.whatsapp !== undefined)           { sets.push(`whatsapp = $${i++}`);            vals.push(body.whatsapp); }
      if (body.ativo !== undefined)              { sets.push(`ativo = $${i++}`);                vals.push(body.ativo); }
      if (body.eventos !== undefined)            { sets.push(`eventos = $${i++}::jsonb`);       vals.push(JSON.stringify(body.eventos)); }
      if (body.evolution_instance !== undefined) { sets.push(`evolution_instance = $${i++}`);   vals.push(body.evolution_instance); }
      vals.push(existing.id);
      await queryOne(
        `UPDATE vps_alertas_config SET ${sets.join(", ")} WHERE id = $${i}`,
        vals
      );
    } else {
      await queryOne(
        `INSERT INTO vps_alertas_config (whatsapp, ativo, eventos, evolution_instance)
         VALUES ($1, $2, $3::jsonb, $4)`,
        [
          body.whatsapp ?? null,
          body.ativo ?? false,
          JSON.stringify(body.eventos ?? []),
          body.evolution_instance ?? null,
        ]
      );
    }
    return ok({ atualizado: true });
  } catch (err) {
    console.error("[VPS/Alertas/PATCH]", err);
    return serverError();
  }
}
