/**
 * GET  /api/painel/agentes — lista agentes da empresa
 * POST /api/painel/agentes — registra novo agente (gera token)
 *   Body: { tipo, nome }
 *   Resposta: { agente, token }   -- token mostrado UMA vez
 *
 * DELETE /api/painel/agentes/[id] — desativa (soft) — em route separada
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { generateAgentToken } from "@/lib/agentes/token";

const ALLOWED = ["master", "admin"];

const TIPOS = ["retaguarda", "terminal", "kiosk", "tv", "garcom", "impressora", "outro"] as const;

const createSchema = z.object({
  tipo: z.enum(TIPOS),
  nome: z.string().min(2).max(100),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const rows = await query<{
      id: string; agente_id: string; tipo: string; nome: string;
      hostname: string | null; ip_ultimo: string | null;
      plataforma: string | null; versao: string | null;
      status: string; ultimo_hb_em: string | null;
      registrado_em: string; primeiro_hb_em: string | null;
      fila_pendente: number; ultimo_pedido_em: string | null;
      token_prefix: string;
    }>(
      `SELECT id, agente_id, tipo, nome, hostname, ip_ultimo::text,
              plataforma, versao, status, ultimo_hb_em,
              registrado_em, primeiro_hb_em, fila_pendente, ultimo_pedido_em,
              token_prefix, rustdesk_id
         FROM agentes
        WHERE empresa_id = $1 AND deleted_at IS NULL
        ORDER BY tipo ASC, nome ASC`,
      [empresaId]
    ).catch(() => []);

    return ok({ agentes: rows });
  } catch (err) {
    console.error("[Agentes/GET]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof createSchema>;
  try { body = createSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const token = generateAgentToken();
    const agenteIdLocal = `${body.tipo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const novo = await queryOne<{ id: string }>(
      `INSERT INTO agentes
         (empresa_id, agente_id, tipo, nome, token_hash, token_prefix, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'aguardando')
       RETURNING id`,
      [empresaId, agenteIdLocal, body.tipo, body.nome, token.hash, token.prefix]
    );

    if (novo) {
      await query(
        `INSERT INTO agentes_eventos (agente_id, empresa_id, tipo, detalhes)
         VALUES ($1, $2, 'registrado', $3::jsonb)`,
        [novo.id, empresaId, JSON.stringify({ por: auth.payload.sub, tipo: body.tipo })]
      ).catch(() => {});
    }

    return ok({
      agente: {
        id:        novo?.id,
        agente_id: agenteIdLocal,
        tipo:      body.tipo,
        nome:      body.nome,
        status:    "aguardando",
      },
      token: token.raw,   // ÚNICA vez que o token vem cleartext
      aviso: "Guarde este token agora — ele não pode ser recuperado depois.",
    }, undefined, 201);
  } catch (err) {
    console.error("[Agentes/POST]", err);
    return serverError();
  }
}
