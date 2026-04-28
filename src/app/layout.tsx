import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cardápio Digital 3D",
  description: "SaaS de cardápio digital interativo com modelos 3D."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
