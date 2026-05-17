import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Three Digital — Sistema SaaS pra Restaurantes",
  description: "Gestão completa: cardápio, delivery, PDV, iFood, WhatsApp, mesas, kiosk e mais.",
};

export default function InstitucionalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
