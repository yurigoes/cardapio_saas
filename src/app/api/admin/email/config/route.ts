/**
 * GET   /api/admin/email/config — config SMTP atual (master)
 * PATCH /api/admin/email/config — atualiza
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { invalidarCacheSmtp } from "@/lib/email/smtp";

interface SmtpRow {
  host: string | null; port: number; secure: boolean;
  username: string | null; password: string | null;
  from_name: string | null; from_email: string | null;
  reply_to: string | null; ativo: boolean;
  ultimo_envio: string | null; ultimo_status: string | null; ultimo_erro: string | null;
  enviados_total: number; falhas_total: number;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    const r = await queryOne<SmtpRow>(
      `SELECT host, port, secure, username, password, from_name, from_email,
              reply_to, ativo, ultimo_envio, ultimo_status, ultimo_erro,
              enviados_total, falhas_total
         FROM smtp_config WHERE id = 1`
    );
    // Mascara password
    if (r && r.password) {
      r.password = "********";
    }
    return ok(r ?? {});
  } catch (err) {
    console.error("[Email/Config/GET]", err);
    return serverError();
  }
}

const schema = z.object({
  host:       z.string().min(1).max(200).nullable().optional(),
  port:       z.number().int().min(1).max(65535).optional(),
  secure:     z.boolean().optional(),
  username:   z.string().max(200).nullable().optional(),
  password:   z.string().max(500).nullable().optional(),
  from_name:  z.string().max(100).nullable().optional(),
  from_email: z.string().email().nullable().optional(),
  reply_to:   z.string().email().nullable().optional(),
  ativo:      z.boolean().optional(),
}).strict();

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  // Se password = "********" (mascarada), não sobrescreve
  const updates: Record<string, unknown> = { ...body };
  if (updates.password === "********") delete updates.password;

  if (Object.keys(updates).length === 0) return badRequest("Nada para atualizar");

  try {
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ");
    const values     = [auth.payload.sub, ...Object.values(updates)];

    await queryOne(
      `UPDATE smtp_config
          SET ${setClauses}, updated_by = $1, updated_at = NOW()
        WHERE id = 1`,
      values
    );

    invalidarCacheSmtp();
    return ok({ updated: true });
  } catch (err) {
    console.error("[Email/Config/PATCH]", err);
    return serverError();
  }
}
