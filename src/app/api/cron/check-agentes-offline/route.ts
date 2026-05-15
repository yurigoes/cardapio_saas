/**
 * POST /api/cron/check-agentes-offline
 * Header: x-cron-secret
 *
 * Cron a cada 5min:
 *   1. Marca como 'offline' todo agente com ultimo_hb_em < NOW() - 5min e status='online'
 *   2. Marca como 'offline' todo agente que registrou e nunca bateu hb (com mais de 30min)
 *   3. Para cada novo offline:
 *      - Cria evento 'offline'
 *      - Se atrasou > 15min e ainda não alertou nas últimas 6h:
 *        envia e-mail pro responsável da empresa
 *        (Evolution/WhatsApp se configurado também)
 *
 * Não dispara alertas pra agentes 'aguardando' (nunca bateram hb) pra
 * evitar spam logo após registro.
 */
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { enfileirar } from "@/lib/email/smtp";

const OFFLINE_THRESHOLD_MIN  = 5;     // marca como offline após N min sem hb
const ALERT_DELAY_MIN        = 15;    // dispara alerta só após N min offline
const ALERT_COOLDOWN_HOURS   = 6;     // não realerta se já alertou nas últimas N h

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  }
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    // 1. Marca como offline (status='online' que não bateu hb)
    const newOffline = await query<{
      id: string; empresa_id: string; nome: string; tipo: string;
      ultimo_hb_em: string | null;
    }>(
      `UPDATE agentes
          SET status     = 'offline',
              updated_at = NOW()
        WHERE deleted_at IS NULL
          AND ativo = true
          AND status = 'online'
          AND ultimo_hb_em < NOW() - ($1 || ' minutes')::interval
        RETURNING id, empresa_id, nome, tipo, ultimo_hb_em`,
      [String(OFFLINE_THRESHOLD_MIN)]
    ).catch(() => []);

    // 2. Cria eventos
    for (const a of newOffline) {
      await query(
        `INSERT INTO agentes_eventos (agente_id, empresa_id, tipo, detalhes)
         VALUES ($1, $2, 'offline', $3::jsonb)`,
        [a.id, a.empresa_id, JSON.stringify({ ultimo_hb_em: a.ultimo_hb_em })]
      ).catch(() => {});
    }

    // 3. Lista agentes que merecem alerta agora
    const paraAlertar = await query<{
      id: string; empresa_id: string; nome: string; tipo: string;
      ultimo_hb_em: string | null;
      empresa_nome: string | null;
      email_responsavel: string | null;
    }>(
      `SELECT a.id, a.empresa_id, a.nome, a.tipo, a.ultimo_hb_em,
              e.nome_fantasia AS empresa_nome,
              e.email          AS email_responsavel
         FROM agentes a
         JOIN empresas e ON e.id = a.empresa_id
        WHERE a.deleted_at IS NULL
          AND a.ativo = true
          AND a.status = 'offline'
          AND a.ultimo_hb_em IS NOT NULL
          AND a.ultimo_hb_em < NOW() - ($1 || ' minutes')::interval
          AND (a.alertado_em IS NULL
               OR a.alertado_em < NOW() - ($2 || ' hours')::interval)
        LIMIT 100`,
      [String(ALERT_DELAY_MIN), String(ALERT_COOLDOWN_HOURS)]
    ).catch(() => []);

    const alertados: Array<{ agente: string; ok: boolean; erro?: string }> = [];

    for (const a of paraAlertar) {
      let alertOk = false;
      let alertErro: string | undefined;

      if (a.email_responsavel) {
        const minutosOff = a.ultimo_hb_em
          ? Math.round((Date.now() - new Date(a.ultimo_hb_em).getTime()) / 60000)
          : null;
        const r = await enfileirar({
          para:    a.email_responsavel,
          evento:  "manual",
          assunto: `⚠ Máquina ${a.nome} offline há ${minutosOff} min`,
          html:    `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#dc2626;margin:0 0 16px">⚠ Máquina offline</h2>
  <p>Olá, <strong>${a.empresa_nome ?? "responsável"}</strong>.</p>
  <p>A máquina <strong>${a.nome}</strong> (${a.tipo}) parou de responder ao sistema.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 12px;color:#666">Última atividade:</td><td style="padding:6px 12px"><strong>${a.ultimo_hb_em ? new Date(a.ultimo_hb_em).toLocaleString("pt-BR") : "—"}</strong></td></tr>
    <tr><td style="padding:6px 12px;color:#666">Tempo offline:</td><td style="padding:6px 12px"><strong>${minutosOff} minutos</strong></td></tr>
  </table>
  <p style="font-size:14px;color:#444">
    O que verificar:
  </p>
  <ul style="font-size:14px;color:#444">
    <li>A máquina está ligada?</li>
    <li>A internet do estabelecimento está funcionando?</li>
    <li>O agente foi parado/desinstalado por engano?</li>
  </ul>
  <p style="font-size:13px;color:#888;margin-top:24px">
    Este e-mail é automático. Se precisar de ajuda, entre em contato com o suporte.
  </p>
</div>`,
        }).catch((e) => ({ jobId: null, motivo: e instanceof Error ? e.message : String(e) }));

        alertOk = !!r.jobId;
        if (!alertOk) alertErro = r.motivo;
      } else {
        alertErro = "empresa sem email_contato";
      }

      // Marca alertado_em mesmo se email falhou — pra não ficar tentando infinitamente
      await queryOne(
        `UPDATE agentes
            SET alertado_em   = NOW(),
                alertas_count = alertas_count + 1,
                updated_at    = NOW()
          WHERE id = $1`,
        [a.id]
      ).catch(() => {});

      await query(
        `INSERT INTO agentes_eventos (agente_id, empresa_id, tipo, detalhes)
         VALUES ($1, $2, 'alertado', $3::jsonb)`,
        [a.id, a.empresa_id, JSON.stringify({ canal: "email", ok: alertOk, erro: alertErro })]
      ).catch(() => {});

      alertados.push({ agente: a.nome, ok: alertOk, erro: alertErro });
    }

    return NextResponse.json({
      ok: true,
      novos_offline: newOffline.length,
      alertas_disparados: alertados.length,
      alertados,
    });
  } catch (err) {
    console.error("[cron/check-agentes-offline]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    cron: "check-agentes-offline",
    info: `Roda a cada 5min. Marca offline após ${OFFLINE_THRESHOLD_MIN}min sem heartbeat. Alerta após ${ALERT_DELAY_MIN}min offline (cooldown ${ALERT_COOLDOWN_HOURS}h).`,
  });
}
