import type { Metadata } from "next";
import "./globals.css";
import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: `${b.nome} — Mídia Indoor`,
    description: "Anuncie sua marca na nossa rede de mídia indoor. Você escolhe os locais, as inserções e acompanha tudo.",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const b = await getBranding();
  // Injeta as cores da marca como CSS vars → Tailwind brand-* usa elas em todo o sistema.
  const css = `:root{--brand:${b.cor};--brand-dark:${b.cor_dark};--brand-light:${b.cor_light};}`;
  return (
    <html lang="pt-BR">
      <head><style dangerouslySetInnerHTML={{ __html: css }} /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
