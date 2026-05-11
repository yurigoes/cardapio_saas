"use client";

import KdsBoard from "@/components/cozinha/KdsBoard";

export default function KdsAdmin({ empresaId }: { empresaId: string }) {
  return (
    <div className="-m-8">
      <KdsBoard empresaId={empresaId} />
    </div>
  );
}
