import KdsBoard from "@/components/cozinha/KdsBoard";

type PageProps = {
  params: {
    empresaId: string;
  };
};

export default function CozinhaPage({ params }: PageProps) {
  return <KdsBoard empresaId={params.empresaId} />;
}
