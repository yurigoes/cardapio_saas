import type { Metadata, Viewport } from "next";
import { cache } from "react";
import { queryOne } from "@/lib/db/client";
import PwaBootstrap from "./PwaBootstrap";

interface EmpresaPub {
  nome_fantasia: string;
  cor_primaria:  string | null;
  logo_url:      string | null;
}

// Memoizado por request — generateMetadata e generateViewport compartilham
const getEmpresa = cache(async (slug: string): Promise<EmpresaPub | null> => {
  return queryOne<EmpresaPub>(
    `SELECT nome_fantasia, cor_primaria, logo_url
     FROM empresas WHERE slug = $1 AND deleted_at IS NULL AND status = 'ativo'`,
    [slug]
  ).catch(() => null);
});

/**
 * Metadata dinâmica por empresa — title, manifest, ícones, apple-touch.
 */
export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const empresa = await getEmpresa(params.slug);
  const nome  = empresa?.nome_fantasia ?? "Meus Pontos";
  const icone = empresa?.logo_url ?? "/icon.svg";

  return {
    title: `Meus Pontos — ${nome}`,
    description: `Acompanhe seus pontos, cupons e histórico em ${nome}`,
    manifest: `/api/pub/manifest/${params.slug}`,
    appleWebApp: {
      capable: true,
      title:  nome,
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon:     icone,
      apple:    icone,
      shortcut: icone,
    },
  };
}

/**
 * Viewport + theme-color (Next.js 14: export separado).
 */
export async function generateViewport(
  { params }: { params: { slug: string } }
): Promise<Viewport> {
  const empresa = await getEmpresa(params.slug);
  return {
    themeColor:   empresa?.cor_primaria ?? "#10b981",
    width:        "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit:  "cover",
  };
}

export default function ClienteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params:   { slug: string };
}) {
  return (
    <>
      <PwaBootstrap slug={params.slug} />
      {children}
    </>
  );
}
