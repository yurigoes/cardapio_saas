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
      `SELECT l.id, l.nome, l.cidade, l.endereco, l.descricao, l.largura, l.altura, l.xibo_display_group_id, l.ativo, l.conteudo_nome, l.splash_nome, l.capacidade_dia, l.orientacao, l.lat, l.lng, l.passantes_dia, l.created_at, l.tipo,
              l.plano_veiculacao, l.encarte_nome, l.encarte_inicio, l.encarte_fim, l.encarte_duracao_seg,
              l.hora_abertura, l.hora_fechamento,
              (SELECT COUNT(*)::int FROM midia_encarte_paginas p WHERE p.local_id = l.id) AS encarte_paginas
         FROM midia_locais l
        WHERE l.archived_at IS NULL AND (l.tipo IS NULL OR l.tipo='individual')
        ORDER BY l.cidade NULLS LAST, l.nome`
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
  plano_veiculacao: z.enum(["publicidade","encarte_totem","ponta_gondola"]).default("publicidade"),
  lat: z.coerce.number().optional().nullable(),
  lng: z.coerce.number().optional().nullable(),
  passantes_dia: z.coerce.number().int().min(0).default(0),
  hora_abertura:   z.string().regex(/^\d{2}:\d{2}$/).default("06:00"),
  hora_fechamento: z.string().regex(/^\d{2}:\d{2}$/).default("22:00"),
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
      `INSERT INTO midia_locais (nome, cidade, endereco, descricao, largura, altura, capacidade_dia, orientacao, lat, lng, passantes_dia, xibo_display_group_id, plano_veiculacao, hora_abertura, hora_fechamento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [b.nome, b.cidade ?? null, b.endereco ?? null, b.descricao ?? null, largura, altura, b.capacidade_dia, b.orientacao, b.lat ?? null, b.lng ?? null, b.passantes_dia, dgId, b.plano_veiculacao, b.hora_abertura, b.hora_fechamento]
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
  largura: z.coerce.number().int().min(120).max(8000).optional(),
  altura: z.coerce.number().int().min(120).max(8000).optional(),
  capacidade_dia: z.coerce.number().int().min(0).optional(),
  orientacao: z.enum(["retrato", "paisagem"]).optional(),
  lat: z.coerce.number().optional().nullable(),
  lng: z.coerce.number().optional().nullable(),
  passantes_dia: z.coerce.number().int().min(0).optional(),
  ativo: z.boolean().optional(),
  plano_veiculacao: z.enum(["publicidade", "encarte_totem", "ponta_gondola"]).optional(),
  hora_abertura:   z.string().regex(/^\d{2}:\d{2}$/).optional(),
  hora_fechamento: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export async function PATCH(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const cronSecret = process.env.CRON_SECRET ?? "";
  const viaKey = cronSecret && key === cronSecret;
  if (!viaKey && !(await exigirMaster(req))) {
    return NextResponse.json({ ok: false, error: "apenas master (ou ?key=CRON_SECRET)" }, { status: 403 });
  }
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;

  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  for (const k of ["nome", "cidade", "endereco", "descricao", "largura", "altura", "capacidade_dia", "orientacao", "lat", "lng", "passantes_dia", "ativo", "plano_veiculacao", "hora_abertura", "hora_fechamento"] as const)
    if (b[k] !== undefined) add(k, b[k]);
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });

  try {
    await ensureSchema();
    vals.push(b.id);
    await db().query(`UPDATE midia_locais SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
    // Arquiva/desarquiva conforme ativo
    if (b.ativo === false) await db().query(`UPDATE midia_locais SET archived_at = COALESCE(archived_at, NOW()) WHERE id = $1`, [b.id]);
    if (b.ativo === true)  await db().query(`UPDATE midia_locais SET archived_at = NULL WHERE id = $1`, [b.id]);

    // AUTO-REAPLICAR: se mudou plano_veiculacao, todas as campanhas no_ar
    // que cobrem esse local precisam ser relancadas pra trocar entre
    // Ad Campaign (publicidade) e interleave (encarte/gondola).
    let campanhasReaplicadas = 0;
    if (b.plano_veiculacao !== undefined) {
      const camps = await db().query<{ id: string }>(
        `SELECT DISTINCT c.id FROM midia_campanhas c
           JOIN midia_campanha_locais cl ON cl.campanha_id = c.id
          WHERE cl.local_id = $1 AND c.status = 'no_ar'`, [b.id]
      ).then(r => r.rows.map(x => x.id));
      if (camps.length > 0) {
        const { lancarCampanha } = await import("@/lib/campanhas");
        for (const cid of camps) {
          try { const r = await lancarCampanha(cid); if (r.ok) campanhasReaplicadas++; }
          catch (e) { console.warn(`[locais PATCH] reaplicar ${cid} falhou:`, (e as Error).message); }
        }
        console.log(`[locais PATCH] plano_veiculacao mudou — ${campanhasReaplicadas}/${camps.length} campanhas reaplicadas`);
      }
      // Tambem regenera o proprio local (cobre caso de mudar pra encarte_totem/ponta_gondola)
      try {
        const { regenerarSeNecessario } = await import("@/lib/veiculacao");
        await regenerarSeNecessario(b.id);
      } catch (e) { console.warn("[locais PATCH] regen local:", (e as Error).message); }
    }

    return NextResponse.json({ ok: true, campanhas_reaplicadas: campanhasReaplicadas });
  } catch (err) {
    console.error("[admin/locais PATCH]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
