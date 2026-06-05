/**
 * GET   /api/admin/locais  — lista pontos (inventário)
 * POST  /api/admin/locais  — cria local + display group no Xibo
 * PATCH /api/admin/locais  — { id, ...campos, ativo? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { criarDisplayGroup } from "@/lib/xibo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    await ensureSchema();
    const rows = await db().query(
      `SELECT id, nome, cidade, endereco, descricao, largura, altura, xibo_display_group_id, ativo, conteudo_nome, splash_nome, capacidade_dia, orientacao, lat, lng, passantes_dia, created_at
         FROM midia_locais WHERE archived_at IS NULL ORDER BY cidade NULLS LAST, nome`
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, locais: rows });
  } catch (err) {
    console.error("[admin/locais GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}

const novo = z.object({
  nome:      z.string().min(1).max(160),
  cidade:    z.string().max(120).optional(),
  endereco:  z.string().max(240).optional(),
  descricao: z.string().max(500).optional(),
  largura:   z.coerce.number().int().min(120).max(8000).optional(),
  altura:    z.coerce.number().int().min(120).max(8000).optional(),
  capacidade_dia: z.coerce.number().int().min(0).default(0),
  orientacao: z.enum(["retrato", "paisagem"]).default("retrato"),
  lat: z.coerce.number().optional().nullable(),
  lng: z.coerce.number().optional().nullable(),
  passantes_dia: z.coerce.number().int().min(0).default(0),
});

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = novo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;

  try {
    await ensureSchema();
    // Cria o display group do local no Xibo (best-effort; se falhar, salva sem)
    let dgId: number | null = null;
    try { dgId = await criarDisplayGroup(`Local — ${b.nome}`, b.cidade ?? ""); }
    catch (e) { console.warn("[locais] não criou display group:", (e as Error).message); }

    // Se não vier largura/altura, usa default conforme a orientação
    const largura = b.largura ?? (b.orientacao === "paisagem" ? 1920 : 1080);
    const altura  = b.altura  ?? (b.orientacao === "paisagem" ? 1080 : 1920);

    const id = await db().query<{ id: string }>(
      `INSERT INTO midia_locais (nome, cidade, endereco, descricao, largura, altura, capacidade_dia, orientacao, lat, lng, passantes_dia, xibo_display_group_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [b.nome, b.cidade ?? null, b.endereco ?? null, b.descricao ?? null, largura, altura, b.capacidade_dia, b.orientacao, b.lat ?? null, b.lng ?? null, b.passantes_dia, dgId]
    ).then(r => r.rows[0].id);
    return NextResponse.json({ ok: true, id, xibo_display_group_id: dgId });
  } catch (err) {
    console.error("[admin/locais POST]", err);
    return NextResponse.json({ ok: false, error: "erro ao criar" }, { status: 500 });
  }
}

const patch = z.object({
  id: z.string().uuid(),
  nome: z.string().min(1).max(160).optional(),
  cidade: z.string().max(120).optional(),
  endereco: z.string().max(240).optional(),
  descricao: z.string().max(500).optional(),
  largura: z.coerce.number().int().optional(),
  altura: z.coerce.number().int().optional(),
  capacidade_dia: z.coerce.number().int().min(0).optional(),
  orientacao: z.enum(["retrato", "paisagem"]).optional(),
  lat: z.coerce.number().optional().nullable(),
  lng: z.coerce.number().optional().nullable(),
  passantes_dia: z.coerce.number().int().min(0).optional(),
  ativo: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;

  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  for (const k of ["nome", "cidade", "endereco", "descricao", "largura", "altura", "capacidade_dia", "orientacao", "lat", "lng", "passantes_dia", "ativo"] as const)
    if (b[k] !== undefined) add(k, b[k]);
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });

  try {
    await ensureSchema();
    vals.push(b.id);
    await db().query(`UPDATE midia_locais SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
    // Arquiva/desarquiva conforme ativo
    if (b.ativo === false) await db().query(`UPDATE midia_locais SET archived_at = COALESCE(archived_at, NOW()) WHERE id = $1`, [b.id]);
    if (b.ativo === true)  await db().query(`UPDATE midia_locais SET archived_at = NULL WHERE id = $1`, [b.id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/locais PATCH]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
