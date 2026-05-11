"use client";

import { Gift, Percent, WalletCards } from "lucide-react";

export default function CuponsFidelidade({ empresaId }: { empresaId: string }) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">Cupons e Fidelidade</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Estratégia de vouchers, pontos e descontos para clientes.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-400 p-3 text-black">
              <Percent className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-black">Pontos virando % de desconto</h2>
          </div>

          <p className="text-sm leading-6 text-zinc-400">
            Exemplo: a cada 100 pontos, o cliente ganha 10% de desconto.
            Esse modelo é bom para incentivar pedidos maiores, porque o desconto acompanha o valor
            do carrinho. O restaurante pode configurar limite máximo, por exemplo até 20%.
          </p>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl bg-amber-400 p-3 text-black">
              <WalletCards className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-black">Pontos virando R$ de desconto</h2>
          </div>

          <p className="text-sm leading-6 text-zinc-400">
            Exemplo: 100 pontos equivalem a R$ 5,00 de desconto.
            Esse modelo é mais previsível para o restaurante, porque o custo do benefício é fixo.
            É ideal para controle financeiro e campanhas simples.
          </p>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-2xl bg-blue-400 p-3 text-black">
            <Gift className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-xl font-black">Modelo recomendado</h2>
            <p className="text-sm text-zinc-500">Empresa #{empresaId}</p>
          </div>
        </div>

        <div className="space-y-3 text-sm leading-6 text-zinc-300">
          <p>
            O ideal é permitir que cada restaurante escolha o tipo de benefício:
            <strong> percentual</strong> ou <strong>valor fixo</strong>.
          </p>
          <p>
            Na próxima etapa, criaremos as tabelas e a tela funcional para:
          </p>
          <ul className="list-disc space-y-2 pl-6 text-zinc-400">
            <li>criar voucher manual para um cliente específico;</li>
            <li>converter pontos em desconto percentual;</li>
            <li>converter pontos em desconto em reais;</li>
            <li>definir validade do voucher;</li>
            <li>definir uso único ou múltiplo;</li>
            <li>enviar o voucher via WhatsApp futuramente.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
