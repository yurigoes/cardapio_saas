/**
 * Layout do totem por empresa. Injeta:
 *  - <link rel="manifest"> apontando pro manifest dinâmico desta empresa
 *    → quando o usuário "Adicionar à tela inicial", o PWA instala com
 *      nome+ícone do restaurante e abre direto em /totem/{slug}
 *  - <meta name="apple-mobile-web-app-title"> p/ iOS usar o nome da empresa
 *  - <meta name="theme-color"> com a cor de destaque do totem
 */
import { Metadata } from "next";
import { queryOne } from "@/lib/db/client";

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const empresa = await queryOne<{
    nome_fantasia: string;
    cor_primaria: string | null;
    totem_cor_destaque: string | null;
  }>(
    `SELECT nome_fantasia, cor_primaria, totem_cor_destaque
       FROM empresas
      WHERE slug = $1 AND deleted_at IS NULL`,
    [params.slug]
  ).catch(() => null);

  const nome = empresa?.nome_fantasia ?? params.slug;
  const tema = empresa?.totem_cor_destaque || empresa?.cor_primaria || "#10B981";

  return {
    title:       `Totem · ${nome}`,
    description: `Autoatendimento ${nome}`,
    manifest:    `/totem/${params.slug}/manifest.webmanifest`,
    themeColor:  tema,
    appleWebApp: {
      capable:    true,
      title:      nome,
      statusBarStyle: "black-translucent",
    },
    other: {
      "mobile-web-app-capable": "yes",
    },
  };
}

export default function TotemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
