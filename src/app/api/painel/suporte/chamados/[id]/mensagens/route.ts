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
import { enfileirar } from "@/lib/email/smtp";

const schema = z.object({
  texto:   z.string().min(1).max(5000),
  interno: z.boolean().optional().default(false),
});

async function notificarChamado(
  chamadoId: string,
  autorTipo: "agente" | "cliente",
  texto:     string,
  interno:   boolean
) {
  if (interno) return; // notas internas não notificam ninguém

  // Pega contexto do chamado pra montar e-mail
  const ctx = await queryOne<{
    assunto:    string;
    empresa_id: string;
    empresa_nome: string;
    usuario_email: string | null;
    email_chamado: string | null;
  }>(
    `SELECT c.assunto, c.empresa_id,
            e.nome_fantasia AS empresa_nome,
            u.email AS usuario_email,
            (SELECT email_chamado FROM suporte_horarios WHERE id = 1) AS email_chamado
       FROM suporte_chamados c
       JOIN empresas e ON e.id = c.empresa_id
       LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.id = $1`,
    [chamadoId]
  ).catch(() => null);
  if (!ctx) return;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tthreedigital.com.br";

  if (autorTipo === "cliente" && ctx.email_chamado) {
    // Cliente respondeu → notifica equipe
    await enfileirar({
      para:    ctx.email_chamado,
      evento:  "manual",
      assunto: `[Suporte] ${ctx.empresa_nome}: ${ctx.assunto}`,
      html: `
        <p><strong>${ctx.empresa_nome}</strong> respondeu ao chamado:</p>
        <blockquote style="border-left:3px solid #ccc;padding-left:10px;color:#555">
          ${texto.replace(/\n/g, "<br>")}
        </blockquote>
        <p><a href="${baseUrl}/admin/suporte/chamados/${chamadoId}">Ver chamado</a></p>
      `,
    }).catch(() => {});
  } else if (autorTipo === "agente" && ctx.usuario_email) {
    // Agente respondeu → notifica cliente
    await enfileirar({
      para:    ctx.usuario_email,
      evento:  "manual",
      assunto: `Resposta no seu chamado: ${ctx.assunto}`,
      html: `
        <p>Olá!</p>
        <p>Nossa equipe respondeu ao seu chamado <strong>${ctx.assunto}</strong>:</p>
        <blockquote style="border-left:3px solid #10b981;padding-left:10px;color:#555">
          ${texto.replace(/\n/g, "<br>")}
        </blockquote>
        <p><a href="${baseUrl}/painel/suporte/chamados/${chamadoId}">Ver e responder</a></p>
        <p style="color:#888;font-size:12px">Não responda este e-mail diretamente.</p>
      `,
    }).catch(() => {});
  }
}

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

  if (body.interno && role !== "master" && role !== "suporte") {
    return forbidden("só master/suporte podem enviar nota interna");
  }

  // Verifica acesso
  const onlyEmpresa = role !== "master" && role !== "suporte";
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

    const autorTipo = (role === "master" || role === "suporte") ? "agente" : "cliente";

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

    // Notificação por e-mail (best-effort, não bloqueia)
    notificarChamado(params.id, autorTipo, body.texto, body.interno).catch(() => {});

    return ok({ id: msg?.id }, undefined, 201);
  } catch (err) {
    console.error("[Mensagens/POST]", err);
    return serverError();
  }
}
