/**
 * POST /api/leads — recebe cadastro da landing de mídia indoor.
 *
 * Salva em Postgres (tabela midia_leads) E opcionalmente notifica
 * você via WhatsApp (Evolution API) que chegou lead novo.
 *
 * Config via env (.env):
 *   DATABASE_URL              postgres://... (pode ser o mesmo PG da VPS, outro schema/db)
 *   EVOLUTION_API_URL         opcional — pra notificar lead novo
 *   EVOLUTION_API_KEY         opcional
 *   EVOLUTION_INSTANCE        opcional — instância que envia
 *   NOTIFY_WHATSAPP           opcional — seu número pra receber alerta (5511...)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Pool } from "pg";

export const runtime = "nodejs";

const schema = z.object({
  plano:    z.string().min(1),
  nome:     z.string().min(2).max(120),
  empresa:  z.string().min(1).max(160),
  email:    z.string().email().max(160),
  whatsapp: z.string().min(8).max(30),
  telas:    z.coerce.number().int().min(1).max(9999).optional(),
  cidade:   z.string().max(120).optional(),
  obs:      z.string().max(1000).optional(),
});

let _pool: Pool | null = null;
function pool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  return _pool;
}

async function garantirTabela(p: Pool) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_leads (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plano       TEXT NOT NULL,
      nome        TEXT NOT NULL,
      empresa     TEXT NOT NULL,
      email       TEXT NOT NULL,
      whatsapp    TEXT NOT NULL,
      telas       INTEGER,
      cidade      TEXT,
      obs         TEXT,
      status      TEXT DEFAULT 'novo',
      ip          TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function notificarWhatsApp(lead: z.infer<typeof schema>) {
  const url      = process.env.EVOLUTION_API_URL;
  const key      = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  const destino  = process.env.NOTIFY_WHATSAPP;
  if (!url || !key || !instance || !destino) return;

  const texto =
    `🎯 *Novo lead — Mídia Indoor*\n\n` +
    `Plano: ${lead.plano}\n` +
    `Nome: ${lead.nome}\n` +
    `Empresa: ${lead.empresa}\n` +
    `Telas: ${lead.telas ?? "?"}\n` +
    `Cidade: ${lead.cidade ?? "-"}\n` +
    `E-mail: ${lead.email}\n` +
    `WhatsApp: ${lead.whatsapp}\n` +
    (lead.obs ? `Obs: ${lead.obs}\n` : "");

  await fetch(`${url.replace(/\/+$/, "")}/message/sendText/${instance}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body:    JSON.stringify({ number: destino, text: texto }),
    signal:  AbortSignal.timeout(8000),
  }).catch(() => null);
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    const r = schema.safeParse(await req.json());
    if (!r.success) {
      return NextResponse.json({ ok: false, error: r.error.errors.map(e => e.message).join("; ") }, { status: 400 });
    }
    body = r.data;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? null;

  // Persiste (se DB configurado)
  const p = pool();
  if (p) {
    try {
      await garantirTabela(p);
      await p.query(
        `INSERT INTO midia_leads (plano, nome, empresa, email, whatsapp, telas, cidade, obs, ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [body.plano, body.nome, body.empresa, body.email, body.whatsapp, body.telas ?? null, body.cidade ?? null, body.obs ?? null, ip]
      );
    } catch (err) {
      console.error("[leads] erro ao salvar:", err);
      // Não falha o cadastro do cliente por erro de DB — segue e notifica
    }
  } else {
    console.warn("[leads] DATABASE_URL não configurado — lead não persistido:", body.email);
  }

  // Notifica você via WhatsApp (best-effort)
  notificarWhatsApp(body).catch(() => null);

  return NextResponse.json({ ok: true });
}
