import { notFound } from "next/navigation";
import {
  getCategorias,
  getInsumos,
  getLicenca,
  getProdutos,
  getTrialStatus
} from "@/lib/api";
import { getEmpresaAtual } from "@/lib/tenant";
import MenuClient from "./menu-client";

type Props = {
  params: {
    slug: string;
  };
};

export async function generateMetadata({
  params
}: {
  params: { slug: string };
}) {
  return {
    title: "Cardápio Digital",
    description: "Cardápio digital interativo",
    manifest: `/${params.slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Cardápio Digital"
    }
  };
}

export default async function CardapioPage({ params }: Props) {
  const rotasReservadas = ["admin"];

  if (rotasReservadas.includes(params.slug)) {
    notFound();
  }

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

  const [categorias, produtosRaw, trialStatus, insumosRaw] =
    await Promise.all([
      getCategorias(empresa.Id),
      getProdutos(empresa.Id),
      getTrialStatus(empresa.Id),
      getInsumos(empresa.Id)
    ]);

  const produtos = (produtosRaw || []).filter((produto: any) => {
    const tipo = String(produto.tipo || "Produto").toLowerCase();

    return (
      tipo !== "adicional" &&
      produto.disponivel !== false
    );
  });

  const insumos = (insumosRaw || []).filter((insumo: any) => {
    return insumo.ativo !== false;
  });

  return (
    <MenuClient
      empresa={empresa}
      categorias={categorias}
      produtos={produtos}
      trialSeconds={trialStatus.restante_segundos || 0}
      insumos={insumos}
    />
  );
}