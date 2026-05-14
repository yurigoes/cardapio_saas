import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ErrorReporter } from "@/components/ErrorReporter";
import { SessionExpiredModal } from "@/components/SessionExpiredModal";
import { ManutencaoBanner } from "@/components/ManutencaoBanner";
import { ConfirmModalRoot } from "@/components/ui/ConfirmModal";

export const metadata: Metadata = {
  title: {
    default:  "Cardápio SaaS",
    template: "%s | Cardápio SaaS",
  },
  description: "Sistema de gestão para restaurantes — cardápio digital, pedidos e muito mais",
  robots:   { index: false, follow: false },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor:   "#10B981",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="antialiased">
        <ManutencaoBanner />
        {children}
        <ErrorReporter />
        <SessionExpiredModal />
        <ConfirmModalRoot />
      </body>
    </html>
  );
}
