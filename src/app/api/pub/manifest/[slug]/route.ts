/**
 * GET /api/pub/manifest/[slug]
 *
 * Manifest PWA dinâmico por empresa — cor da marca, ícone (logo),
 * nome customizado. Servido com Content-Type correto e cache curto.
 *
 * Usado em <link rel="manifest"> no layout do /cliente/[slug] e /totem/[slug].
 */
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db/client";
import { EMPRESA_OPERACIONAL_SQL } from "@/lib/billing/empresa-acesso";

interface EmpresaPwa {
  nome_fantasia:  string;
  cor_primaria:   string | null;
  cor_secundaria: string | null;
  logo_url:       string | null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const empresa = await queryOne<EmpresaPwa>(
    `SELECT nome_fantasia, cor_primaria, cor_secundaria, logo_url
     FROM empresas
     WHERE slug = $1 AND deleted_at IS NULL AND ${EMPRESA_OPERACIONAL_SQL}`,
    [params.slug]
  );

  if (!empresa) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  const cor      = empresa.cor_primaria   || "#10b981";
  const corBg    = empresa.cor_secundaria || "#0f172a"; // slate-900
  const escopo   = req.nextUrl.searchParams.get("scope") ?? `/cliente/${params.slug}`;
  const startUrl = req.nextUrl.searchParams.get("start") ?? `/cliente/${params.slug}`;

  // Se há logo da empresa, usa como ícone PWA. Senão, fallback para favicon padrão.
  const icone = empresa.logo_url || "/favicon.ico";

  const manifest = {
    name:             empresa.nome_fantasia,
    short_name:       empresa.nome_fantasia.slice(0, 12),
    description:      `Programa de fidelidade ${empresa.nome_fantasia}`,
    start_url:        startUrl,
    scope:            escopo,
    display:          "standalone",
    orientation:      "portrait",
    background_color: corBg,
    theme_color:      cor,
    icons: [
      { src: icone, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: icone, sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
    categories: ["food", "lifestyle"],
    lang:       "pt-BR",
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type":  "application/manifest+json",
      "Cache-Control": "public, max-age=300, s-maxage=600", // 5min browser, 10min CDN
    },
  });
}
