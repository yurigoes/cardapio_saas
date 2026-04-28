import { notFound } from "next/navigation";
import { getCategorias, getLicenca, getProdutos } from "@/lib/api";
import { getEmpresaAtual } from "@/lib/tenant";
import MenuClient from "./menu-client";

type Props = {
  params: {
    slug: string;
  };
};

export default async function CardapioPage({ params }: Props) {
  const empresa = await getEmpresaAtual(params.slug);

  if (!empresa) {
    notFound();
  }

  const licenca = await getLicenca(empresa.Id);

  if (!licenca.ativa) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="text-2xl font-bold">Cardápio indisponível</h1>
          <p className="mt-3 text-slate-300">
            Este cardápio está temporariamente bloqueado ou com licença expirada.
          </p>
        </div>
      </main>
    );
  }

  const [categorias, produtos] = await Promise.all([
    getCategorias(empresa.Id),
    getProdutos(empresa.Id)
  ]);

  return (
    <MenuClient
      empresa={empresa}
      categorias={categorias}
      produtos={produtos}
    />
  );
}
