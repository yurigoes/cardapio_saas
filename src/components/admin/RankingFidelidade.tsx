"use client";

import { useEffect, useMemo, useState } from "react";
import { Crown, RefreshCw, Search, Trophy } from "lucide-react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type Cliente = {
  Id?: number;
  nome?: string;
  telefone?: string;
  cpf?: string;
  total_pedidos?: number | string;
  total_gasto?: number | string;
  pontos_fidelidade?: number | string;
  ultimo_pedido_em?: string;
};

function money(value: number | string | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function RankingFidelidade({ empresaId }: { empresaId: string }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    try {
      setLoading(true);
      setErro("");

      const res = await fetch(
        `${API}/api/db/leads_clientes_cardapio?where=(empresa_id,eq,${empresaId})&limit=1000`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Erro ao carregar ranking.");

      setClientes(Array.isArray(data?.list) ? data.list : []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar ranking.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [empresaId]);

  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    return clientes
      .filter((cliente) => {
        if (!termo) return true;

        return [cliente.nome, cliente.telefone, cliente.cpf]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termo);
      })
      .sort(
        (a, b) =>
          Number(b.pontos_fidelidade || 0) - Number(a.pontos_fidelidade || 0)
      );
  }, [clientes, busca]);

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-black">Ranking de Fidelidade</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Clientes com mais pontos, pedidos e gasto acumulado.
          </p>
        </div>

        <div className="flex gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar cliente..."
              className="bg-transparent text-sm outline-none placeholder:text-zinc-500"
            />
          </div>

          <button
            type="button"
            onClick={carregar}
            className="rounded-2xl bg-white/10 px-4 py-3 font-black transition hover:bg-white/20"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {erro && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
          {erro}
        </div>
      )}

      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
        {filtrados.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">
            {loading ? "Carregando clientes..." : "Nenhum cliente encontrado."}
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {filtrados.map((cliente, index) => (
              <div
                key={cliente.Id || index}
                className="grid gap-4 px-5 py-4 xl:grid-cols-[80px_1.2fr_1fr_1fr_1fr] xl:items-center"
              >
                <div className="flex items-center gap-2">
                  {index < 3 ? (
                    <Trophy className="h-6 w-6 text-amber-300" />
                  ) : (
                    <Crown className="h-5 w-5 text-zinc-500" />
                  )}
                  <strong>#{index + 1}</strong>
                </div>

                <div>
                  <p className="font-black">{cliente.nome || "Cliente"}</p>
                  <p className="text-sm text-zinc-500">
                    {cliente.telefone || cliente.cpf || "Sem identificação"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-zinc-500">Pontos</p>
                  <p className="text-xl font-black text-emerald-300">
                    {Number(cliente.pontos_fidelidade || 0)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-zinc-500">Pedidos</p>
                  <p className="font-black">{Number(cliente.total_pedidos || 0)}</p>
                </div>

                <div>
                  <p className="text-sm text-zinc-500">Total gasto</p>
                  <p className="font-black">{money(cliente.total_gasto)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
