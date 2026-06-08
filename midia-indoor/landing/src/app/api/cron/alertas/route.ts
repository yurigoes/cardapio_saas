/**
 * GET/POST /api/cron/alertas?key=CRON_SECRET
 * Verifica condições operacionais e envia um e-mail de resumo ao master.
 *   - Telas offline há > 1h
 *   - Campanhas no ar vencendo em 7 dias
 *   - Campanhas aguardando arte há > 24h
 *   - Pagamentos pendentes há > 48h
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { listarDisplaysFull } from "@/lib/xibo";
import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

async function processar(): Promise<{ telasOff: string[]; aVencer: string[]; semArte: string[]; pgtoPendente: string[]; resumo: string }> {
  await ensureSchema();
  const p = db();

  // Telas offline há > 1h
  const displays = await listarDisplaysFull().catch(() => []);
  const agora = Date.now();
  const telasOff = displays
    .filter(d => d.loggedIn === 0 && d.lastAccessed && (agora - new Date(String(d.lastAccessed).replace(" ", "T")).getTime()) > 3600_000)
    .map(d => d.display);

  const [aVencer, semArte, pgtoPendente] = await Promise.all([
    p.query<{ nome: string; empresa: string; data_fim: string }>(
      `SELECT c.nome, ct.empresa, c.data_fim FROM midia_campanhas c JOIN midia_contas ct ON ct.id=c.conta_id
        WHERE c.status='no_ar' AND c.data_fim IS NOT NULL
          AND c.data_fim BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`
    ).then(r => r.rows.map(x => `${x.empresa}: ${x.nome} (vence ${String(x.data_fim).slice(0,10)})`)),
    p.query<{ nome: string; empresa: string }>(
      `SELECT c.nome, ct.empresa FROM midia_campanhas c JOIN midia_contas ct ON ct.id=c.conta_id
        WHERE c.status IN ('rascunho','aguardando_arte') AND c.created_at < NOW() - INTERVAL '24 hours' AND c.xibo_layout_id IS NULL`
    ).then(r => r.rows.map(x => `${x.empresa}: ${x.nome}`)),
    p.query<{ nome: string; empresa: string }>(
      `SELECT c.nome, ct.empresa FROM midia_campanhas c JOIN midia_contas ct ON ct.id=c.conta_id
        WHERE c.status_pagamento='pendente' AND c.valor>0 AND c.updated_at < NOW() - INTERVAL '48 hours'`
    ).then(r => r.rows.map(x => `${x.empresa}: ${x.nome}`)),
  ]);

  const linhas: string[] = [];
  if (telasOff.length)     linhas.push(`<p><strong>Telas offline >1h:</strong></p><ul>${telasOff.map(s => `<li>${s}</li>`).join("")}</ul>`);
  if (aVencer.length)      linhas.push(`<p><strong>Campanhas vencendo em ≤7 dias:</strong></p><ul>${aVencer.map(s => `<li>${s}</li>`).join("")}</ul>`);
  if (semArte.length)      linhas.push(`<p><strong>Campanhas sem arte (>24h):</strong></p><ul>${semArte.map(s => `<li>${s}</li>`).join("")}</ul>`);
  if (pgtoPendente.length) linhas.push(`<p><strong>Pagamentos pendentes (>48h):</strong></p><ul>${pgtoPendente.map(s => `<li>${s}</li>`).join("")}</ul>`);

  if (!linhas.length) return { telasOff, aVencer, semArte, pgtoPendente, resumo: "" };
  return { telasOff, aVencer, semArte, pgtoPendente, resumo: linhas.join("") };
}

async function handle(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || key !== secret) return NextResponse.json({ ok: false, error: "não autorizado" }, { status: 401 });

  try {
    const r = await processar();
    if (r.resumo) {
      const b = await getBranding();
      const para = b.email || process.env.SMTP_FROM?.replace(/.*<|>.*/g, "") || process.env.MASTER_EMAIL || "";
      if (para) {
        const { default: nodemailer } = await import("nodemailer");
        const host = process.env.SMTP_HOST;
        if (host) {
          const tx = nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined });
          await tx.sendMail({ from: process.env.SMTP_FROM ?? `${b.nome} <noreply@${(b.site ?? "tthreedigital.com.br").replace("https://", "")}>`, to: para, subject: `[${b.nome}] Alertas operacionais`, html: `<h2 style="color:${b.cor};">Alertas operacionais</h2>${r.resumo}` });
        }
      }
    }
    return NextResponse.json({ ok: true, ...r, resumo: r.resumo ? "enviado" : "nada a alertar" });
  } catch (err) {
    console.error("[cron/alertas]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
