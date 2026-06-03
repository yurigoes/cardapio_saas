import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BrandingVars } from "@/components/Branding";
import { PWARegister } from "@/components/PWA";

export const metadata: Metadata = {
  title: "Mídia Indoor",
  description: "Anuncie sua marca na nossa rede de mídia indoor. Você escolhe os locais, as inserções e acompanha tudo.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TD Mídia" },
};
export const viewport: Viewport = { themeColor: "#0a0a12", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <BrandingVars />
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
