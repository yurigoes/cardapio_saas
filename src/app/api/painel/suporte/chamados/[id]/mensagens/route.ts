/**
 * POST /api/painel/suporte/chamados/[id]/mensagens
 * Body: { texto, interno?: boolean }
 *
 * Cliente ou agente envia mensagem. Master pode marcar 'interno' = nota interna.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";

const schema = z.object({
  texto:   z.string().min(1).max(5000),
  interno: z.boolean().optional().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, sub, role } = auth.payload;

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  if (body.interno && role !== "master") {
    return forbidden("só master pode enviar nota interna");
  }

  // Verifica acesso
  const onlyEmpresa = role !== "master";
  const chamado = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM suporte_chamados
      WHERE id = $1 ${onlyEmpresa ? "AND empresa_id = $2" : ""}`,
    onlyEmpresa ? [params.id, empresaId] : [params.id]
  );
  if (!chamado) return notFound("chamado não encontrado");
  if (chamado.status === "fechado") return badRequest("chamado fechado, abra novo");

  try {
    const usuario = await queryOne<{ nome: string }>(
      `SELECT nome FROM usuarios WHERE id = $1`, [sub]
    );

    const autorTipo = role === "master" ? "agente" : "cliente";

    const msg = await queryOne<{ id: string }>(
      `INSERT INTO suporte_mensagens
         (chamado_id, autor_id, autor_tipo, autor_nome, texto, interno)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [params.id, sub, autorTipo, usuario?.nome ?? "?", body.texto, body.interno]
    );

    // Atualiza chamado: ultima_msg + auto-status
    let novoStatus: string | null = null;
    if (autorTipo === "agente" && chamado.status === "aberto") novoStatus = "em_andamento";
    if (autorTipo === "cliente" && chamado.status === "aguardando_cliente") novoStatus = "em_andamento";

    await queryOne(
      `UPDATE suporte_chamados
          SET ultima_msg_em  = NOW(),
              ultima_msg_por = $1,
              atualizado_em  = NOW(),
              status         = COALESCE($2, status),
              primeira_resposta_em = COALESCE(primeira_resposta_em,
                CASE WHEN $3 = 'agente' THEN NOW() ELSE NULL END)
        WHERE id = $4`,
      [sub, novoStatus, autorTipo, params.id]
    );

    return ok({ id: msg?.id }, undefined, 201);
  } catch (err) {
    console.error("[Mensagens/POST]", err);
    return serverError();
  }
}
