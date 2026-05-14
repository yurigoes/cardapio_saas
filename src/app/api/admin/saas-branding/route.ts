/**
 * GET   /api/admin/saas-branding   — config (master only)
 * PATCH /api/admin/saas-branding   — atualiza
 *
 * Persiste em settings (chave='saas_branding').
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";

const KEY = "saas_branding";
const DEFAULT = {
  nome:      "Cardápio SaaS",
  logo_url:  null as string | null,
  email:     null as string | null,
  telefone:  null as string | null,
  whatsapp:  null as string | null,
  site:      null as string | null,
};

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();
  try {
    const r = await queryOne<{ valor: typeof DEFAULT }>(
      `SELECT valor FROM settings WHERE chave = $1`, [KEY]
    );
    return ok({ ...DEFAULT, ...(r?.valor ?? {}) });
  } catch (err) {
    console.error("[SaaS-Branding/GET]", err);
    return serverError();
  }
}

const schema = z.object({
  nome:     z.string().min(1).max(100).optional(),
  logo_url: z.string().url().nullable().optional(),
  email:    z.string().email().nullable().optional(),
  telefone: z.string().max(30).nullable().optional(),
  whatsapp: z.string().max(30).nullable().optional(),
  site:     z.string().url().nullable().optional(),
}).strict();

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    // Pega valor atual e mescla
    const atual = await queryOne<{ valor: typeof DEFAULT }>(
      `SELECT valor FROM settings WHERE chave = $1`, [KEY]
    );
    const novo = { ...DEFAULT, ...(atual?.valor ?? {}), ...body };

    await queryOne(
      `INSERT INTO settings (chave, valor, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (chave) DO UPDATE
         SET valor = EXCLUDED.valor, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [KEY, JSON.stringify(novo), auth.payload.sub]
    );
    return ok(novo);
  } catch (err) {
    console.error("[SaaS-Branding/PATCH]", err);
    return serverError();
  }
}
