/**
 * GET /manifest-admin.json
 *
 * Manifest dinâmico do PWA admin/painel — usa nome + cor do branding
 * configurado pelo master, mascarando o "Three Digital" hardcoded
 * do arquivo static legado.
 */
import { NextResponse } from "next/server";
import { getSaasBranding } from "@/lib/branding/server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const b = await getSaasBranding();
  return NextResponse.json({
    name:        `${b.nome} — Painel`,
    short_name:  b.nome.length > 12 ? b.nome.slice(0, 12) : b.nome,
    description: `Painel administrativo do ${b.nome}`,
    start_url:   "/painel",
    scope:       "/painel",
    display:     "standalone",
    background_color: "#020617",
    theme_color:      "#10b981",
    orientation:      "any",
    categories: ["business", "productivity", "food"],
    icons: [
      {
        src:     b.logo_url ?? "/icon.svg",
        sizes:   "any",
        type:    b.logo_url ? "image/png" : "image/svg+xml",
        purpose: "any maskable",
      },
    ],
    shortcuts: [
      { name: "PDV / Balcão", url: "/painel/pdv",     description: "Venda rápida" },
      { name: "Pedidos",      url: "/painel/pedidos", description: "Pedidos do dia" },
      { name: "Caixa",        url: "/painel/caixa",   description: "Abrir/fechar caixa" },
    ],
  }, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
