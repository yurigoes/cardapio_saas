/**
 * GET /api/painel/suporte/horarios
 *   Devolve config + se está dentro do horário agora.
 *
 * PUT /api/painel/suporte/horarios
 *   Master only. Atualiza config.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";

interface Horario { dia: string; inicio: string; fim: string; }

const DIAS = ["dom","seg","ter","qua","qui","sex","sab"];

function dentroDoHorario(horarios: Horario[], fuso: string): boolean {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const wd  = parts.find(p => p.type === "weekday")?.value.toLowerCase().slice(0,3); // sun/mon/...
    const hh  = parts.find(p => p.type === "hour")?.value;
    const mm  = parts.find(p => p.type === "minute")?.value;
    if (!wd || !hh || !mm) return false;
    const wdMap: Record<string,string> = { sun:"dom", mon:"seg", tue:"ter", wed:"qua", thu:"qui", fri:"sex", sat:"sab" };
    const dia = wdMap[wd];
    const agora = `${hh}:${mm}`;
    const cfg = horarios.find(h => h.dia === dia);
    if (!cfg) return false;
    return agora >= cfg.inicio && agora <= cfg.fim;
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const cfg = await queryOne<{
    ativo: boolean; fuso: string; horarios: Horario[];
    mensagem_offline: string; email_chamado: string | null;
    email_subject_resposta: string; email_html_resposta: string;
    email_subject_chamado_novo: string; email_html_chamado_novo: string;
    whatsapp_resposta_cliente: string;
    whatsapp_validacao_admin: string; whatsapp_validacao_usuario: string;
  }>(`SELECT ativo, fuso, horarios, mensagem_offline, email_chamado,
             COALESCE(email_subject_resposta, '') AS email_subject_resposta,
             COALESCE(email_html_resposta, '') AS email_html_resposta,
             COALESCE(email_subject_chamado_novo, '') AS email_subject_chamado_novo,
             COALESCE(email_html_chamado_novo, '') AS email_html_chamado_novo,
             COALESCE(whatsapp_resposta_cliente, '') AS whatsapp_resposta_cliente,
             COALESCE(whatsapp_validacao_admin, '') AS whatsapp_validacao_admin,
             COALESCE(whatsapp_validacao_usuario, '') AS whatsapp_validacao_usuario
        FROM suporte_horarios WHERE id = 1`).catch(() => null);

  if (!cfg) return ok({ ativo: false, online_agora: false, mensagem_offline: "Suporte indisponível" });

  return ok({
    ...cfg,
    online_agora: cfg.ativo && dentroDoHorario(cfg.horarios, cfg.fuso),
    dias_validos: DIAS,
  });
}

const putSchema = z.object({
  ativo:            z.boolean().optional(),
  fuso:             z.string().min(3).max(50).optional(),
  horarios:         z.array(z.object({
    dia:    z.enum(["dom","seg","ter","qua","qui","sex","sab"]),
    inicio: z.string().regex(/^\d{2}:\d{2}$/),
    fim:    z.string().regex(/^\d{2}:\d{2}$/),
  })).optional(),
  mensagem_offline: z.string().max(500).optional(),
  email_chamado:    z.string().email().nullable().optional(),
  email_subject_resposta:     z.string().max(200).optional(),
  email_html_resposta:        z.string().max(10000).optional(),
  email_subject_chamado_novo: z.string().max(200).optional(),
  email_html_chamado_novo:    z.string().max(10000).optional(),
  whatsapp_resposta_cliente:  z.string().max(2000).optional(),
  whatsapp_validacao_admin:   z.string().max(2000).optional(),
  whatsapp_validacao_usuario: z.string().max(2000).optional(),
});

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof putSchema>;
  try { body = putSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    await queryOne(
      `UPDATE suporte_horarios SET
         ativo            = COALESCE($1, ativo),
         fuso             = COALESCE($2, fuso),
         horarios         = COALESCE($3::jsonb, horarios),
         mensagem_offline = COALESCE($4, mensagem_offline),
         email_chamado    = COALESCE($5, email_chamado),
         email_subject_resposta     = COALESCE($6, email_subject_resposta),
         email_html_resposta        = COALESCE($7, email_html_resposta),
         email_subject_chamado_novo = COALESCE($8, email_subject_chamado_novo),
         email_html_chamado_novo    = COALESCE($9, email_html_chamado_novo),
         whatsapp_resposta_cliente  = COALESCE($10, whatsapp_resposta_cliente),
         whatsapp_validacao_admin   = COALESCE($11, whatsapp_validacao_admin),
         whatsapp_validacao_usuario = COALESCE($12, whatsapp_validacao_usuario),
         atualizado_em    = NOW()
       WHERE id = 1`,
      [body.ativo ?? null, body.fuso ?? null,
       body.horarios ? JSON.stringify(body.horarios) : null,
       body.mensagem_offline ?? null, body.email_chamado ?? null,
       body.email_subject_resposta ?? null, body.email_html_resposta ?? null,
       body.email_subject_chamado_novo ?? null, body.email_html_chamado_novo ?? null,
       body.whatsapp_resposta_cliente ?? null,
       body.whatsapp_validacao_admin ?? null, body.whatsapp_validacao_usuario ?? null]
    );
    return ok({ ok: true });
  } catch (err) {
    console.error("[Horarios/PUT]", err);
    return serverError();
  }
}
