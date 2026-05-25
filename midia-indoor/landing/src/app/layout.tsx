import type { Metadata } from "next";
import "./globals.css";
import { BrandingVars } from "@/components/Branding";

export const metadata: Metadata = {
  title: "Mídia Indoor",
  description: "Anuncie sua marca na nossa rede de mídia indoor. Você escolhe os locais, as inserções e acompanha tudo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <BrandingVars />
        {children}
      </body>
    </html>
  );
}
