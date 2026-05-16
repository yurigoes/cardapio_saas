/**
 * GET  /api/admin/evolution/master   — devolve config (api_key cifrada)
 * PUT  /api/admin/evolution/master   — atualiza
 *   Body: { ativo?, url?, api_key?, instance_name?, numero_remetente? }
 *
 * Master only. api_key cifrada AES via encryptField.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { encryptField } from "@/lib/ifood/client";

interface CfgRow {
  ativo: boolean; url: string | null; api_key: string | null;
  instance_name: string | null; numero_remetente: string | null;
  ultimo_teste_em: string | null; ultimo_teste_ok: boolean | null;
  ultimo_teste_msg: string | null;
  atualizado_em: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const r = await queryOne<CfgRow>(
    `SELECT ativo, url, api_key, instance_name, numero_remetente,
            ultimo_teste_em::text, ultimo_teste_ok, ultimo_teste_msg,
            atualizado_em::text
       FROM master_evolution_config WHERE id = 1`
  );
  if (r?.api_key) r.api_key = "********"; // mask
  return ok(r ?? { ativo: false });
}

const schema = z.object({
  ativo:            z.boolean().optional(),
  url:              z.string().url().nullable().optional(),
  api_key:          z.string().min(8).max(500).nullable().optional(),
  instance_name:    z.string().max(120).nullable().optional(),
  numero_remetente: z.string().max(30).nullable().optional(),
}).strict();

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const updates: Record<string, unknown> = { ...body };
  if (updates.api_key === "********") delete updates.api_key;
  if (typeof updates.api_key === "string" && updates.api_key.length > 0) {
    try { updates.api_key = encryptField(updates.api_key); }
    catch (e) { return serverError("Falha ao cifrar api_key — verifique ENCRYPTION_KEY"); }
  }

  if (Object.keys(updates).length === 0) return badRequest("Nada pra atualizar");

  try {
    const sets = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ");
    const vals = [auth.payload.sub, ...Object.values(updates)];
    await queryOne(
      `UPDATE master_evolution_config
          SET ${sets}, atualizado_por = $1, atualizado_em = NOW()
        WHERE id = 1`,
      vals
    );
    return ok({ ok: true });
  } catch (err) {
    console.error("[Evolution/master/PUT]", err);
    return serverError();
  }
}
