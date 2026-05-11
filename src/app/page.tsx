"use client";

import { FormEvent, useEffect, useState } from "react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type Plano = {
  Id: number;
  nome?: string;
  descricao?: string;
  tipo_plano?: string;
  periodicidade?: string;
  valor?: number | string;
  meses_fidelidade?: number | string;
  recursos_json?: string;
};


async function lerJsonSeguro(res: Response) {
  const texto = await res.text();

  try {
    return texto ? JSON.parse(texto) : {};
  } catch {
    throw new Error(
      `A API retornou uma resposta inválida (${res.status}). Verifique se as rotas públicas do backend estão ativas.`
    );
  }
}

function money(value: any) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function HomePage() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoSelecionado, setPlanoSelecionado] = useState<Plano | null>(null);
  const [cnpjBusca, setCnpjBusca] = useState("");
  const [linksResultado, setLinksResultado] = useState<any[]>([]);
  const [modalLinks, setModalLinks] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    empresa_nome: "",
    razao_social: "",
    nome_filial: "Matriz",
    nome_responsavel: "",
    email: "",
    telefone: "",
    cnpj: "",
    observacao: "",
  });

  useEffect(() => {
    fetch(`${API}/api/cardapio/public/planos`, { cache: "no-store" })
      .then((res) => lerJsonSeguro(res))
      .then((data) => setPlanos(Array.isArray(data?.planos) ? data.planos : []))
      .catch(() => setPlanos([]));
  }, []);

  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function contratar(event: FormEvent) {
    event.preventDefault();
    if (!planoSelecionado) return;

    try {
      setLoading(true);
      setErro("");

      const res = await fetch(`${API}/api/cardapio/public/contratar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, plano_id: planoSelecionado.Id }),
      });

      const data = await lerJsonSeguro(res);

      if (!res.ok) throw new Error(data?.error || "Erro ao gerar checkout.");

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (error: any) {
      setErro(error?.message || "Erro ao contratar.");
    } finally {
      setLoading(false);
    }
  }

  async function buscarLinks() {
    try {
      setErro("");
      const cnpj = cnpjBusca.replace(/\D/g, "");

      if (!cnpj) throw new Error("Informe o CNPJ.");

      const res = await fetch(`${API}/api/cardapio/public/links/${cnpj}`, {
        cache: "no-store",
      });

      const data = await lerJsonSeguro(res);

      if (!res.ok) throw new Error(data?.error || "Erro ao buscar links.");

      setLinksResultado(Array.isArray(data?.empresas) ? data.empresas : []);
      setModalLinks(true);
    } catch (error: any) {
      setErro(error?.message || "Erro ao buscar links.");
    }
  }

  async function reativar(item: any) {
    const res = await fetch(`${API}/api/cardapio/public/reativar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empresa_id: item.empresa.Id,
        mensalidade_id: item.mensalidade_pendente?.Id,
        plano_id: item.empresa.plano_atual_id,
      }),
    });

    const data = await lerJsonSeguro(res);

    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="relative overflow-hidden px-6 py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,.24),transparent_35%),radial-gradient(circle_at_top_right,rgba(59,130,246,.18),transparent_30%)]" />

        <div className="relative mx-auto max-w-7xl">
          <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">
                YuGo Cardápio
              </p>
              <h1 className="mt-3 max-w-4xl text-4xl font-black md:text-6xl">
                Cardápio digital completo para restaurantes.
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-zinc-300">
                Cardápio, pedidos, KDS, painel TV, PDV, impressão local,
                fidelidade, cupons e relatórios em uma única plataforma.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-bold text-zinc-400">Ver meus links</p>
              <div className="mt-3 flex gap-2">
                <input
                  value={cnpjBusca}
                  onChange={(event) => setCnpjBusca(event.target.value)}
                  placeholder="Digite o CNPJ"
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
                />
                <button
                  type="button"
                  onClick={buscarLinks}
                  className="rounded-2xl bg-emerald-400 px-4 font-black text-black"
                >
                  Buscar
                </button>
              </div>
            </div>
          </header>

          {erro && (
            <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-200">
              {erro}
            </div>
          )}

          <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
            <div>
              <h2 className="text-2xl font-black">Planos com fidelidade</h2>
              <p className="mt-2 text-zinc-400">
                Mensal, trimestral, semestral, anual ou vitalício com servidor próprio.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {planos.length === 0 ? (
                  <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 text-zinc-400">
                    Nenhum plano ativo encontrado.
                  </div>
                ) : (
                  planos.map((plano) => {
                    const selected = planoSelecionado?.Id === plano.Id;
                    const vitalicio = String(plano.tipo_plano || "")
                      .toLowerCase()
                      .includes("vital");

                    return (
                      <button
                        key={plano.Id}
                        type="button"
                        onClick={() => setPlanoSelecionado(plano)}
                        className={`rounded-[2rem] border p-5 text-left transition ${
                          selected
                            ? "border-emerald-300 bg-emerald-400/10"
                            : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-xl font-black">{plano.nome}</h3>
                          {vitalicio && (
                            <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-black">
                              Servidor próprio
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-sm text-zinc-400">{plano.descricao}</p>
                        <p className="mt-4 text-3xl font-black">{money(plano.valor)}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Fidelidade: {plano.meses_fidelidade || 0} meses
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <form
              onSubmit={contratar}
              className="rounded-[2.4rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl"
            >
              <h2 className="text-2xl font-black">Contratar agora</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Plano selecionado:{" "}
                <strong>{planoSelecionado?.nome || "selecione um plano"}</strong>
              </p>

              <div className="mt-5 grid gap-3">
                {[
                  ["empresa_nome", "Nome fantasia"],
                  ["razao_social", "Razão social"],
                  ["nome_filial", "Filial"],
                  ["cnpj", "CNPJ"],
                  ["nome_responsavel", "Responsável"],
                  ["email", "Email"],
                  ["telefone", "Telefone"],
                ].map(([key, label]) => (
                  <label key={key}>
                    <span className="mb-1 block text-xs font-bold text-zinc-400">
                      {label}
                    </span>
                    <input
                      value={(form as any)[key]}
                      onChange={(event) => update(key, event.target.value)}
                      required={key !== "razao_social"}
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-emerald-300"
                    />
                  </label>
                ))}

                <textarea
                  value={form.observacao}
                  onChange={(event) => update("observacao", event.target.value)}
                  placeholder="Observação"
                  className="min-h-20 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-emerald-300"
                />
              </div>

              <button
                type="submit"
                disabled={!planoSelecionado || loading}
                className="mt-5 w-full rounded-2xl bg-emerald-400 px-4 py-4 font-black text-black transition hover:bg-emerald-300 disabled:opacity-50"
              >
                {loading ? "Gerando checkout..." : "Gerar checkout Pix/cartão"}
              </button>
            </form>
          </div>
        </div>
      </section>

      {modalLinks && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-black">Meus links</h2>
              <button
                onClick={() => setModalLinks(false)}
                className="rounded-2xl bg-white/10 px-4 py-2 font-black"
              >
                Fechar
              </button>
            </div>

            {linksResultado.length === 0 ? (
              <div className="rounded-2xl bg-white/5 p-6 text-center text-zinc-400">
                Nenhuma empresa encontrada para este CNPJ.
              </div>
            ) : (
              <div className="space-y-4">
                {linksResultado.map((item) => (
                  <div
                    key={item.empresa.Id}
                    className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-xl font-black">
                          {item.empresa.nome_fantasia}
                        </h3>
                        <p className="text-sm text-zinc-400">
                          {item.empresa.nome_filial || "Matriz"} •{" "}
                          {item.ativa ? "Licença ativa" : "Licença pendente/inativa"}
                        </p>
                      </div>

                      {!item.ativa && (
                        <button
                          onClick={() => reativar(item)}
                          className="rounded-2xl bg-amber-400 px-4 py-3 font-black text-black"
                        >
                          Reativar licença
                        </button>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {item.links.map((link: any) => (
                        <a
                          key={link.Id}
                          href={link.url}
                          target="_blank"
                          className="flex items-center justify-between rounded-2xl bg-black/30 px-4 py-3 transition hover:bg-white/10"
                        >
                          <span>{link.titulo || link.modulo}</span>
                          <span>↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
