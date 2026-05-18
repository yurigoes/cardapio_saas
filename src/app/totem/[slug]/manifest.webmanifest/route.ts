/**
 * GET /totem/[slug]/manifest.webmanifest
 *
 * Manifest PWA dinâmico por empresa. Quando o usuário fizer "Adicionar
 * à tela inicial" estando em /totem/[slug], o app instalado abre direto
 * naquele totem e usa o nome+ícone do restaurante.
 */
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db/client";

export const revalidate = 3600; // cache 1h

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const empresa = await queryOne<{
    nome_fantasia: string;
    logo_url: string | null;
    totem_logo_url: string | null;
    cor_primaria: string | null;
    totem_cor_destaque: string | null;
    totem_tema: string | null;
  }>(
    `SELECT nome_fantasia, logo_url, totem_logo_url, cor_primaria,
            totem_cor_destaque, totem_tema
       FROM empresas
      WHERE slug = $1 AND deleted_at IS NULL`,
    [params.slug]
  ).catch(() => null);

  const nome      = empresa?.nome_fantasia ?? params.slug;
  const shortName = nome.length > 12 ? nome.slice(0, 12) : nome;
  const themeCor  = empresa?.totem_cor_destaque || empresa?.cor_primaria || "#10B981";
  const bgCor     = empresa?.totem_tema === "claro" ? "#F8FAFC" : "#020617";
  const iconUrl   = empresa?.totem_logo_url || empresa?.logo_url || "/icon.svg";

  const manifest = {
    name:             `Totem · ${nome}`,
    short_name:       shortName,
    description:      `Autoatendimento ${nome}`,
    start_url:        `/totem/${params.slug}`,
    scope:            `/totem/${params.slug}`,
    display:          "standalone",
    orientation:      "portrait",
    background_color: bgCor,
    theme_color:      themeCor,
    icons: [
      // Se for logo do restaurante (imagem real), declaramos como "maskable any"
      // pro Android usar como ícone da PWA. Fallback pro icon.svg geral.
      { src: iconUrl, sizes: "512x512", type: iconUrl.endsWith(".svg") ? "image/svg+xml" : "image/png", purpose: "any" },
      { src: iconUrl, sizes: "192x192", type: iconUrl.endsWith(".svg") ? "image/svg+xml" : "image/png", purpose: "any" },
    ],
    categories: ["food", "business"],
    id:         `/totem/${params.slug}`,
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type":  "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
