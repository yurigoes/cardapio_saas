import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Painel de Atendimento",
  description: "Painel de chamada de clientes",
};

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
