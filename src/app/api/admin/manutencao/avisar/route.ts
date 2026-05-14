/**
 * POST /api/admin/manutencao/avisar
 * Body: { inicio, duracao, impacto, detalhes? }
 *
 * Master broadcast: enfileira e-mail "manutencao_aviso" pra TODAS empresas
 * operacionais com e-mail cadastrado. Idempotente por ~6h via marker.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { enfileirar as enfileirarEmail, smtpAtivo } from "@/lib/email/smtp";

const schema = z.object({
  inicio:   z.string().min(1).max(100),       // texto livre tipo "16/05 às 02h BRT"
  duracao:  z.string().min(1).max(60),        // tipo "30 min" ou "1-2h"
  impacto:  z.string().min(1).max(200),       // tipo "Painel inacessível, totem segue funcionando"
  detalhes: z.string().max(2000).optional(),
  apenas_teste: z.boolean().optional(),       // se true, devolve quantas seriam mas não enfileira
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  if (!await smtpAtivo()) {
    return badRequest("SMTP não configurado/ativo. Configure em /admin/email primeiro.");
  }

  try {
    // Empresas operacionais com e-mail
    const empresas = await query<{
      id: string; nome_fantasia: string; email: string;
    }>(
      `SELECT id, nome_fantasia, email
         FROM empresas
        WHERE email IS NOT NULL AND email <> ''
          AND deleted_at IS NULL
          AND status IN ('ativa', 'teste')
        ORDER BY nome_fantasia`
    );

    if (body.apenas_teste) {
      return ok({
        modo:     "teste",
        total:    empresas.length,
        mensagem: `${empresas.length} empresa(s) receberiam o aviso. Desmarque "apenas teste" pra enviar de fato.`,
      });
    }

    let enfileirados = 0;
    let pulados      = 0;

    for (const emp of empresas) {
      // Anti-duplicação: já avisou nas últimas 6h?
      const ja = await queryOne<{ id: string }>(
        `SELECT id FROM email_jobs
          WHERE evento = 'manutencao_aviso'
            AND contexto->>'empresa_id' = $1
            AND created_at > NOW() - INTERVAL '6 hours'
          LIMIT 1`,
        [emp.id]
      ).catch(() => null);
      if (ja) { pulados++; continue; }

      const r = await enfileirarEmail({
        para:     emp.email,
        evento:   "manutencao_aviso",
        vars: {
          empresa_nome: emp.nome_fantasia,
          inicio:       body.inicio,
          duracao:      body.duracao,
          impacto:      body.impacto,
          detalhes:     body.detalhes ?? "",
        },
        contexto: {
          empresa_id:   emp.id,
          tipo:         "manutencao_broadcast",
          solicitante:  auth.payload.sub,
        },
      });
      if (r.jobId) enfileirados++;
    }

    return ok({
      total_empresas: empresas.length,
      enfileirados,
      pulados_dup:    pulados,
      mensagem:       `${enfileirados} aviso(s) enfileirado(s) ${pulados ? `· ${pulados} pulado(s) (já avisado nas últimas 6h)` : ""}`,
    });
  } catch (err) {
    console.error("[Manutencao/Avisar]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
