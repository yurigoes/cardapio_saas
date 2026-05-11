"use client";

import { Empresa } from "@/types";
import { useEffect, useState } from "react";

type Props = {
  empresa?: Empresa;
  nome?: string;
  pontos: {
    gerados: number;
    saldo: number;
  };
  primaryColor?: string;
};

export default function SuccessScreen({
  empresa,
  nome,
  pontos,
  primaryColor = "#d9b35f"
}: Props) {
  const [seconds, setSeconds] = useState(15);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          window.dispatchEvent(new Event("reset-totem"));
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/90 px-6 text-white backdrop-blur-xl">
      <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-center shadow-2xl">
        {empresa?.logo_url && (
          <img
            src={empresa.logo_url}
            alt={empresa.nome_fantasia || "Logo"}
            className="mx-auto mb-5 h-20 w-20 rounded-3xl object-contain"
          />
        )}

        <p
          className="text-xs font-black uppercase tracking-[0.35em]"
          style={{ color: primaryColor }}
        >
          Pedido gerado
        </p>

        <h2 className="mt-4 text-4xl font-black">
          Obrigado{nome ? `, ${nome}` : ""}!
        </h2>

        <p className="mt-4 text-lg text-white/70">
          Seu pedido foi gerado com sucesso.
        </p>

        <div className="mt-6 rounded-2xl bg-white/10 p-5">
          <p className="text-white/60">Você ganhou</p>
          <strong className="text-4xl" style={{ color: primaryColor }}>
            {Number(pontos.gerados || 0)} pontos
          </strong>

          <p className="mt-4 text-white/60">Total acumulado</p>
          <strong className="text-2xl">
            {Number(pontos.saldo || 0)} pontos
          </strong>
        </div>

        <p className="mt-6 text-sm text-white/40">
          Voltando para o início em {seconds}s
        </p>
      </div>
    </div>
  );
}
