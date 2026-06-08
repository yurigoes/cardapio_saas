/**
 * GET /api/admin/healthcheck
 * Resumo unificado do estado do sistema — pra dashboard semáforo.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";
import { listarDisplaysFull } from "@/lib/xibo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const p = db();
  const agora = Math.floor(Date.now() / 1000);

  // Telas
  let telas = { total: 0, online: 0, offline: 0, problemas: 0 };
  try {
    const displays = await listarDisplaysFull();
    telas.total = displays.length;
    for (const d of displays) {
      if (d.loggedIn === 1) telas.online++;
      else telas.offline++;
      // offline há mais de 1h = problema
      if (d.loggedIn !== 1 && d.lastAccessed && agora - d.lastAccessed > 3600) telas.problemas++;
    }
  } catch (e) { console.warn("[healthcheck] xibo:", (e as Error).message); }

  // Campanhas
  const campanhas = await p.query<{ total: string; no_ar: string; vencendo: string; arte_pendente: string; pgto_pendente: string }>(
    `SELECT
       COUNT(*)::text AS total,
       SUM(CASE WHEN status='no_ar' THEN 1 ELSE 0 END)::text AS no_ar,
       SUM(CASE WHEN status='no_ar' AND data_fim BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN 1 ELSE 0 END)::text AS vencendo,
       SUM(CASE WHEN arte_status='aguardando_aprovacao' THEN 1 ELSE 0 END)::text AS arte_pendente,
       SUM(CASE WHEN status='no_ar' AND status_pagamento='pendente' THEN 1 ELSE 0 END)::text AS pgto_pendente
       FROM midia_campanhas WHERE archived_at IS NULL`
  ).then(r => r.rows[0]);

  // Anunciantes
  const anunc = await p.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM midia_contas WHERE archived_at IS NULL AND status='ativo'`
  ).then(r => r.rows[0]);

  // Chamados abertos
  let chamados = 0;
  try {
    const r = await p.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM midia_chamados WHERE status='aberto'`);
    chamados = Number(r.rows[0]?.n ?? 0);
  } catch { /* tabela pode não existir */ }

  // Score geral (0-100)
  const totalProblemas = telas.problemas + Number(campanhas.arte_pendente) + Number(campanhas.vencendo);
  const score = Math.max(0, 100 - (telas.problemas * 15) - (Number(campanhas.arte_pendente) * 5) - (Number(campanhas.vencendo) * 3) - (chamados * 2));
  const status = score >= 90 ? "saudavel" : score >= 70 ? "atencao" : "critico";

  return NextResponse.json({
    ok: true,
    score, status,
    telas,
    campanhas: {
      total: Number(campanhas.total),
      no_ar: Number(campanhas.no_ar),
      vencendo: Number(campanhas.vencendo),
      arte_pendente: Number(campanhas.arte_pendente),
      pgto_pendente: Number(campanhas.pgto_pendente),
    },
    anunciantes: Number(anunc.total),
    chamados,
    problemas_total: totalProblemas,
  });
}
