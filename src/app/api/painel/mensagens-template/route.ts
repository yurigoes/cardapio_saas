/**
 * GET  /api/painel/mensagens-template
 *   Lista templates da empresa, mesclando com defaults.
 *
 * PUT  /api/painel/mensagens-template
 *   Upsert (body: { evento, texto, ativo? })
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { TEMPLATES_DEFAULT, EVENTOS_VALIDOS } from "@/lib/notify/evolution";

const ALLOWED_ROLES = ["master", "admin", "gerente"];

interface TemplateRow {
  id:     string;
  evento: string;
  texto:  string;
  ativo:  boolean;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED_ROLES.includes(auth.payload.role)) return forbidden();

  const empresaId = auth.payload.empresaId;
  if (!empresaId) return forbidden();

  try {
    const rows = await query<TemplateRow>(
      `SELECT id, evento, texto, ativo
         FROM mensagens_template
        WHERE empresa_id = $1
        ORDER BY evento`,
      [empresaId]
    );

    // Mescla com defaults: para cada evento válido, retorna template salvo OU default
    const byEvento = Object.fromEntries(rows.map(r => [r.evento, r]));
    const merged = EVENTOS_VALIDOS.map(ev => ({
      evento:     ev,
      texto:      byEvento[ev]?.texto ?? TEMPLATES_DEFAULT[ev],
      ativo:      byEvento[ev]?.ativo ?? true,
      customizado: !!byEvento[ev],
    }));

    return ok({ templates: merged });
  } catch (err) {
    console.error("[MensagensTemplate/GET]", err);
    return serverError();
  }
}

const upsertSchema = z.object({
  evento: z.enum(EVENTOS_VALIDOS as [string, ...string[]]),
  texto:  z.string().min(1).max(2000),
  ativo:  z.boolean().optional().default(true),
});

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED_ROLES.includes(auth.payload.role)) return forbidden();

  const empresaId = auth.payload.empresaId;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof upsertSchema>;
  try {
    body = upsertSchema.parse(await req.json());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Body inválido");
  }

  try {
    await queryOne(
      `INSERT INTO mensagens_template (empresa_id, evento, texto, ativo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (empresa_id, evento) DO UPDATE SET
         texto      = EXCLUDED.texto,
         ativo      = EXCLUDED.ativo,
         updated_at = NOW()
       RETURNING id`,
      [empresaId, body.evento, body.texto, body.ativo]
    );

    return ok({ saved: true, evento: body.evento });
  } catch (err) {
    console.error("[MensagensTemplate/PUT]", err);
    return serverError();
  }
}
