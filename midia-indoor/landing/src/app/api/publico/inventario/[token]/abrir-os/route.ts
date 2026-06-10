/**
 * POST /api/publico/inventario/[token]/abrir-os
 *
 * Endpoint PUBLICO (sem auth) — tecnico no campo escaneia QR e abre OS.
 * Body: { motivo: 'problema'|..., descricao: string, autor_nome?: string }
 *
 * Limitacoes (anti-abuso):
 *  - Rate limit por IP (simples in-memory)
 *  - Descricao max 2000 chars
 *  - Sem upload de foto via aqui (precisaria auth)
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { abrirOS, type OsMotivo } from "@/lib/inventario-os";

export const dynamic = "force-dynamic";

// Rate limit simples: max 5 OS por IP por hora
const rateMap = new Map<string, number[]>();
function checkRate(ip: string): boolean {
  const now = Date.now();
  const arr = (rateMap.get(ip) ?? []).filter(t => now - t < 3600_000);
  if (arr.length >= 5) return false;
  arr.push(now); rateMap.set(ip, arr);
  return true;
}

const MOTIVOS_OK: OsMotivo[] = ["problema", "manutencao", "substituicao", "perda", "instalacao", "outro"];

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRate(ip)) return NextResponse.json({ ok: false, error: "muitas requisicoes — tente em 1h" }, { status: 429 });

  const body = await req.json().catch(() => null) as { motivo?: string; descricao?: string; autor_nome?: string } | null;
  if (!body?.motivo || !body.descricao) {
    return NextResponse.json({ ok: false, error: "motivo e descricao obrigatorios" }, { status: 400 });
  }
  if (!MOTIVOS_OK.includes(body.motivo as OsMotivo)) {
    return NextResponse.json({ ok: false, error: "motivo invalido" }, { status: 400 });
  }
  const desc = String(body.descricao).slice(0, 2000);
  const autorNome = (body.autor_nome ?? "").slice(0, 100) || "Anonimo (via QR)";

  await ensureSchema();
  const item = await db().query<{ id: string }>(
    `SELECT id FROM midia_inventario WHERE qr_token = $1 LIMIT 1`, [params.token.toUpperCase()]
  ).then(r => r.rows[0]);
  if (!item) return NextResponse.json({ ok: false, error: "QR nao encontrado" }, { status: 404 });

  const r = await abrirOS({
    inventarioId: item.id,
    motivo: body.motivo as OsMotivo,
    descricao: desc,
    autor: { tipo: "publico", id: ip, nome: autorNome },
  });
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
}
