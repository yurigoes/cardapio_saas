/**
 * GET   /api/admin/branding — branding atual
 * PUT   /api/admin/branding — atualiza { nome, logo_url, cor, cor_dark, cor_light, site, email, whatsapp, cnpj, razao_social }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  return NextResponse.json({ ok: true, branding: await getBranding() });
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "cor deve ser hex #RRGGBB");
const schema = z.object({
  nome:         z.string().min(1).max(120).optional(),
  logo_url:     z.string().max(500).optional().nullable(),
  cor:          hex.optional(),
  cor_dark:     hex.optional(),
  cor_light:    hex.optional(),
  site:         z.string().max(200).optional().nullable(),
  email:        z.string().max(160).optional().nullable(),
  whatsapp:     z.string().max(40).optional().nullable(),
  cnpj:         z.string().max(40).optional().nullable(),
  razao_social: z.string().max(200).optional().nullable(),
  player_apk_url: z.string().max(500).optional().nullable(),
  player_versao:  z.string().max(40).optional().nullable(),
});

export async function PUT(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.errors.map(e => e.message).join("; ") }, { status: 400 });
  const b = parsed.data;

  const sets: string[] = []; const vals: unknown[] = [];
  const add = (c: string, v: unknown) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  for (const k of ["nome", "logo_url", "cor", "cor_dark", "cor_light", "site", "email", "whatsapp", "cnpj", "razao_social", "player_apk_url", "player_versao"] as const)
    if (b[k] !== undefined) add(k, b[k]);
  if (!sets.length) return NextResponse.json({ ok: false, error: "nada para atualizar" }, { status: 400 });

  try {
    await ensureSchema();
    vals.push(1);
    await db().query(`UPDATE midia_branding SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
    return NextResponse.json({ ok: true, branding: await getBranding() });
  } catch (err) {
    console.error("[admin/branding PUT]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
