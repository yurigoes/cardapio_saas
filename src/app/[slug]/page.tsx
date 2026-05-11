import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db/client";
import { EmpresaPublica, CategoriaPublica, ProdutoPublico } from "@/types";
import MenuClient from "./menu-client";

// Sempre renderiza no servidor — nunca gera estático durante o build
export const dynamic = "force-dynamic";

type Props = {
  params: { slug: string };
};

export default async function CardapioPage({ params }: Props) {
  // Resolve empresa pelo slug OU pelo host (subdomínio / domínio próprio)
  let empresa: EmpresaPublica | null = null;

  try {
    empresa = await queryOne<EmpresaPublica>(
      `SELECT id, nome_fantasia, logo_url, cor_primaria, cor_secundaria, whatsapp
       FROM empresas
       WHERE slug = $1
         AND deleted_at IS NULL
         AND status = 'ativo'`,
      [params.slug]
    );
  } catch {
    // DB indisponível — exibe página de erro em vez de crash
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="text-2xl font-bold">Serviço temporariamente indisponível</h1>
          <p className="mt-3 text-slate-300">Tente novamente em alguns instantes.</p>
        </div>
      </main>
    );
  }

  if (!empresa) {
    notFound();
  }

  const [categorias, produtos] = await Promise.all([
    query<CategoriaPublica>(
      `SELECT id, nome, descricao, imagem_url, ordem
       FROM categorias
       WHERE empresa_id = $1
         AND deleted_at IS NULL
         AND disponivel = true
       ORDER BY ordem ASC, nome ASC`,
      [empresa.id]
    ),
    query<ProdutoPublico>(
      `SELECT id, categoria_id, nome, descricao, preco, imagem_url,
              tempo_preparo, tipo, destaque
       FROM produtos
       WHERE empresa_id = $1
         AND deleted_at IS NULL
         AND disponivel = true
       ORDER BY nome ASC`,
      [empresa.id]
    ),
  ]);

  return (
    <MenuClient
      empresa={empresa}
      categorias={categorias}
      produtos={produtos}
    />
  );
}
