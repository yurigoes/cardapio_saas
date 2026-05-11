import PainelTv from "@/components/painel/PainelTv";

type PageProps = {
  params: {
    empresaId: string;
  };
};

export default function PainelPage({ params }: PageProps) {
  return <PainelTv empresaId={params.empresaId} />;
}
