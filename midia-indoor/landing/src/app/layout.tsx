import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Three Digital Mídia — Mídia Indoor pro seu negócio",
  description: "Transforme suas TVs em uma rede de mídia indoor. Cardápio digital, promoções e anúncios gerenciados de um painel só.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
