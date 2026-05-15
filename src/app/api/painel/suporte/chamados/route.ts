/**
 * GET  /api/painel/suporte/chamados        — lista chamados da empresa
 * POST /api/painel/suporte/chamados        — abre chamado novo
 *   Body: { assunto, mensagem, prioridade?, canal? }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role } = auth.payload;
  const isAgent = role === "master" || role === "suporte";
  if (!isAgent && !empresaId) return forbidden();

  // Master e suporte veem todos; demais só da própria empresa
  const onlyEmpresa = !isAgent;

  // 2 fixes:
  // - Removido c.deleted_at IS NULL (coluna não existe na tabela)
  // - JOIN → LEFT JOIN em empresas (chamados internos do SaaS sem empresa_id)
  try {
    const rows = await query(
      `SELECT c.id, c.assunto, c.prioridade, c.status, c.canal, c.tags,
              c.criado_em::text, c.atualizado_em::text, c.ultima_msg_em::text,
              c.fechado_em::text, c.empresa_id,
              COALESCE(e.nome_fantasia, '(sem empresa)') AS empresa_nome,
              u.nome AS atribuido_nome,
              (SELECT COUNT(*) FROM suporte_mensagens m
                WHERE m.chamado_id = c.id AND m.lido_em IS NULL AND m.autor_tipo != 'agente') AS msgs_nao_lidas
         FROM suporte_chamados c
         LEFT JOIN empresas e ON e.id = c.empresa_id
         LEFT JOIN usuarios u ON u.id = c.atribuido_a
        ${onlyEmpresa ? "WHERE c.empresa_id = $1" : ""}
        ORDER BY
          CASE c.status
            WHEN 'aberto' THEN 1
            WHEN 'em_andamento' THEN 2
            WHEN 'aguardando_cliente' THEN 3
            WHEN 'resolvido' THEN 4
            WHEN 'fechado' THEN 5
          END,
          CASE c.prioridade
            WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4
          END,
          c.atualizado_em DESC
        LIMIT 200`,
      onlyEmpresa ? [empresaId] : []
    );
    return ok({ chamados: rows });
  } catch (err) {
    console.error("[Chamados/GET]", err);
    return ok({ chamados: [] });
  }
}

const novoSchema = z.object({
  assunto:    z.string().min(3).max(200),
  mensagem:   z.string().min(3).max(5000),
  prioridade: z.enum(["baixa","normal","alta","urgente"]).optional().default("normal"),
  canal:      z.enum(["chat","email","whatsapp","telefone","outro"]).optional().default("chat"),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, sub, role } = auth.payload;
  // Master/suporte abrindo chamado interno (não vinculado a empresa)
  // não faz sentido — devem responder, não abrir. Mas permitimos.
  if (!empresaId && role !== "master" && role !== "suporte") return forbidden();

  let body: z.infer<typeof novoSchema>;
  try { body = novoSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const usuario = await queryOne<{ nome: string }>(
      `SELECT nome FROM usuarios WHERE id = $1`, [sub]
    );

    const chamado = await queryOne<{ id: string }>(
      `INSERT INTO suporte_chamados
         (empresa_id, usuario_id, assunto, prioridade, canal)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [empresaId ?? null, sub, body.assunto, body.prioridade, body.canal]
    );

    if (!chamado) return serverError("falha criar chamado");

    await queryOne(
      `INSERT INTO suporte_mensagens
         (chamado_id, autor_id, autor_tipo, autor_nome, texto)
       VALUES ($1, $2, 'cliente', $3, $4)`,
      [chamado.id, sub, usuario?.nome ?? "Cliente", body.mensagem]
    );

    return ok({ id: chamado.id }, undefined, 201);
  } catch (err) {
    console.error("[Chamados/POST]", err);
    return serverError();
  }
}
