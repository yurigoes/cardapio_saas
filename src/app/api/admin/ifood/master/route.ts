/**
 * GET   /api/admin/ifood/master — config master da app Distribuída
 * PATCH /api/admin/ifood/master — atualiza credenciais
 *
 * Master only. Credenciais cifradas AES-256-GCM via lib encryptField.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { encryptField } from "@/lib/ifood/client";

interface CfgRow {
  client_id:     string | null;
  client_secret: string | null;
  app_nome:      string | null;
  ativo:         boolean;
  ultimo_userCode_em: string | null;
  ultimo_erro:   string | null;
  ultimo_erro_em: string | null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    const r = await queryOne<CfgRow>(
      `SELECT client_id, client_secret, app_nome, ativo,
              ultimo_userCode_em, ultimo_erro, ultimo_erro_em
         FROM saas_ifood_config WHERE id = 1`
    ).catch((err) => {
      // Tabela não existe — orienta deploy
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("undefined_table")) {
        return null;
      }
      throw err;
    });

    if (r) {
      if (r.client_id)     r.client_id     = "********";
      if (r.client_secret) r.client_secret = "********";
    }
    return ok(r ?? {
      _aviso: "Tabela saas_ifood_config não existe. Rode 'bash scripts/deploy.sh' na VPS pra aplicar migration 053.",
    });
  } catch (err) {
    console.error("[Admin/Ifood/Master/GET]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

const schema = z.object({
  client_id:     z.string().min(8).max(200).nullable().optional(),
  client_secret: z.string().min(8).max(500).nullable().optional(),
  app_nome:      z.string().max(100).nullable().optional(),
  ativo:         z.boolean().optional(),
}).strict();

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const updates: Record<string, unknown> = { ...body };
  if (updates.client_id     === "********") delete updates.client_id;
  if (updates.client_secret === "********") delete updates.client_secret;

  // Cifra
  try {
    if (typeof updates.client_id === "string" && updates.client_id.length > 0) {
      updates.client_id = encryptField(updates.client_id);
    }
    if (typeof updates.client_secret === "string" && updates.client_secret.length > 0) {
      updates.client_secret = encryptField(updates.client_secret);
    }
  } catch (err) {
    console.error("[Admin/Ifood/Master/PATCH] encrypt:", err);
    return serverError("Falha ao cifrar — verifique ENCRYPTION_KEY");
  }

  if (Object.keys(updates).length === 0) return badRequest("Nada para atualizar");

  try {
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ");
    const values     = [auth.payload.sub, ...Object.values(updates)];
    await queryOne(
      `UPDATE saas_ifood_config
          SET ${setClauses}, updated_by = $1, updated_at = NOW()
        WHERE id = 1`,
      values
    );
    return ok({ updated: true });
  } catch (err) {
    console.error("[Admin/Ifood/Master/PATCH]", err);
    return serverError();
  }
}
