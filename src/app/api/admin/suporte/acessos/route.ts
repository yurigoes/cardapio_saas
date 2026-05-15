/**
 * GET  /api/admin/suporte/acessos        — lista todos
 * POST /api/admin/suporte/acessos        — cria pra empresa
 *   Body: { empresa_id, duracao: '24h'|'30d'|'90d'|'sempre' }
 *   Resposta: { acesso, chave } — chave 1x cleartext
 *
 * Master only.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError, conflict } from "@/lib/utils/response";
import { generateSupportKey, calcularExpiracao } from "@/lib/suporte/token";

const schema = z.object({
  empresa_id: z.string().uuid(),
  duracao:    z.enum(["24h", "30d", "90d", "sempre"]),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    const rows = await query(
      `SELECT s.id, s.empresa_id, s.chave_prefix, s.duracao,
              s.liberado_em, s.expira_em, s.personalizado, s.personalizado_em,
              s.revogado_em, s.motivo_revogacao,
              s.ultimo_uso, s.acessos_count,
              e.nome_fantasia AS empresa_nome,
              CASE
                WHEN s.revogado_em IS NOT NULL THEN 'revogado'
                WHEN s.expira_em IS NOT NULL AND s.expira_em < NOW() THEN 'expirado'
                ELSE 'ativo'
              END AS status
         FROM suporte_acessos s
         JOIN empresas e ON e.id = s.empresa_id
        ORDER BY s.liberado_em DESC
        LIMIT 200`
    ).catch(() => []);
    return ok({ acessos: rows });
  } catch (err) {
    console.error("[Admin/Suporte/GET]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    // Revoga acesso ativo anterior se houver (pra UNIQUE INDEX permitir novo)
    await queryOne(
      `UPDATE suporte_acessos
          SET revogado_em      = NOW(),
              revogado_por     = $1,
              motivo_revogacao = 'Substituído por novo acesso'
        WHERE empresa_id = $2 AND revogado_em IS NULL`,
      [auth.payload.sub, body.empresa_id]
    ).catch(() => {});

    const key      = generateSupportKey();
    const expira   = calcularExpiracao(body.duracao);

    const novo = await queryOne<{ id: string }>(
      `INSERT INTO suporte_acessos
         (empresa_id, chave_hash, chave_prefix, duracao, liberado_por, expira_em)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [body.empresa_id, key.hash, key.prefix, body.duracao, auth.payload.sub, expira]
    );

    if (!novo) return serverError("Falha ao criar acesso");

    return ok({
      acesso: {
        id:           novo.id,
        empresa_id:   body.empresa_id,
        duracao:      body.duracao,
        expira_em:    expira?.toISOString() ?? null,
        chave_prefix: key.prefix,
      },
      chave: key.raw,        // ÚNICA vez em cleartext
      aviso: "Anote esta chave agora — ela não pode ser recuperada depois.",
    }, undefined, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return conflict("Já existe acesso ativo pra essa empresa");
    }
    console.error("[Admin/Suporte/POST]", err);
    return serverError();
  }
}
