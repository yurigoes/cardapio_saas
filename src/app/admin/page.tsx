"use client";

import { useEffect, useState } from "react";
import { getAdminUser, logoutAdmin } from "@/lib/adminAuth";
import AdminShell from "@/components/admin/AdminShell";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API || "https://connect.yugochat.com.br";

export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loadingPayment, setLoadingPayment] = useState<number | null>(null);

  async function load(adminUser: any) {
    const params = new URLSearchParams({
      role: adminUser.role,
      empresa_id: String(adminUser.empresa_id || "")
    });

    const res = await fetch(`${API}/api/cardapio/admin/dashboard?${params}`, {
      cache: "no-store"
    });

    const json = await res.json();
    setData(json);
  }

  async function gerarCheckout(mensalidadeId: number) {
    setLoadingPayment(mensalidadeId);

    const res = await fetch(
      `${API}/api/cardapio/mensalidades/${mensalidadeId}/checkout-pro`,
      { method: "POST" }
    );

    const json = await res.json();
    setLoadingPayment(null);

    if (json.checkout_url) {
      window.open(json.checkout_url, "_blank");
      alert(
        "Checkout aberto. O dashboard atualiza automaticamente quando o pagamento for confirmado."
      );

      if (user) await load(user);
    } else {
      alert(JSON.stringify(json));
    }
  }

  useEffect(() => {
    const adminUser = getAdminUser();

    if (!adminUser) {
      window.location.href = "/admin/login";
      return;
    }

    setUser(adminUser);
    load(adminUser);
  }, []);

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      load(user);
    }, 15000);

    return () => clearInterval(interval);
  }, [user]);

  if (!user || !data) {
    return (
      <AdminShell>
        <div className="min-h-screen p-10">Carregando...</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">Dashboard Cardápio</h1>
            <p className="mt-2 text-zinc-400">
              Logado como {user.nome} • {user.role}
            </p>
          </div>

          <div className="flex gap-3">
            {user.role === "ADM" && (
              <a
                href="/admin/empresas/nova"
                className="rounded-full bg-emerald-500 px-6 py-3 font-bold text-white"
              >
                Nova empresa
              </a>
            )}

            <button
              onClick={logoutAdmin}
              className="rounded-full bg-red-500 px-6 py-3 font-bold text-white"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white/[0.05] p-6 shadow-2xl">
            <p className="text-zinc-400">Total</p>
            <strong className="text-4xl">{data.total}</strong>
          </div>

          <div className="rounded-3xl bg-white/[0.05] p-6 shadow-2xl">
            <p className="text-zinc-400">Ativos</p>
            <strong className="text-4xl text-emerald-400">
              {data.ativos}
            </strong>
          </div>

          <div className="rounded-3xl bg-white/[0.05] p-6 shadow-2xl">
            <p className="text-zinc-400">Bloqueados</p>
            <strong className="text-4xl text-red-400">
              {data.bloqueados}
            </strong>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl backdrop-blur">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead className="bg-white/[0.06] text-zinc-300">
              <tr>
                <th className="p-4">Empresa</th>
                <th className="p-4">Licença</th>
                <th className="p-4">Trial</th>
                <th className="p-4">Vencimento</th>
                <th className="p-4">Mensalidade</th>
                <th className="p-4">Pagamentos</th>
                <th className="p-4">Ações</th>
              </tr>
            </thead>

            <tbody>
              {data.clientes?.map((cliente: any) => (
                <tr key={cliente.Id} className="border-t border-white/10">
                  <td className="p-4">
                    <div className="font-bold">{cliente.nome_fantasia}</div>
                    <div className="text-xs text-zinc-500">
                      {cliente.subdominio}
                    </div>
                  </td>

                  <td className="p-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        cliente.status_licenca === "Ativa"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-red-500/20 text-red-300"
                      }`}
                    >
                      {cliente.status_licenca}
                    </span>
                  </td>

                  <td className="p-4">
                    {cliente.trial_ativo
                      ? `${cliente.trial_usado_minutos}/${cliente.trial_total_minutos} min`
                      : "Não"}
                  </td>

                  <td className="p-4">{cliente.data_fim || "-"}</td>

                  <td className="p-4">
                    <div>{cliente.mensalidade_status}</div>
                    {cliente.mensalidade_valor && (
                      <div className="text-xs text-zinc-500">
                        R$ {cliente.mensalidade_valor}
                      </div>
                    )}
                  </td>

                  <td className="p-4">
                    {cliente.mensalidade_id ? (
                      <div className="flex flex-wrap gap-2">
                        {cliente.mensalidade_status !== "Pago" && (
                          <button
                            onClick={() =>
                              gerarCheckout(cliente.mensalidade_id)
                            }
                            disabled={
                              loadingPayment === cliente.mensalidade_id
                            }
                            className="rounded-full bg-blue-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {loadingPayment === cliente.mensalidade_id
                              ? "Gerando..."
                              : "Gerar Checkout"}
                          </button>
                        )}

                        {cliente.checkout_url &&
                          cliente.mensalidade_status !== "Pago" && (
                            <a
                              href={cliente.checkout_url}
                              target="_blank"
                              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white"
                            >
                              Abrir pagamento
                            </a>
                          )}

                        {cliente.mensalidades_pagas?.length > 0 && (
                          <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                            {cliente.mensalidades_pagas.length} pagamento(s)
                            confirmado(s)
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-zinc-500">Sem cobrança</span>
                    )}
                  </td>

                  <td className="p-4">
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/admin/empresas/${cliente.Id}`}
                        className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold"
                      >
                        Editar
                      </a>

                      <a
                        href={cliente.url}
                        target="_blank"
                        className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold"
                      >
                        Ver
                      </a>

                      <a
                        href={cliente.url_subdominio}
                        target="_blank"
                        className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold"
                      >
                        Subdomínio
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={() => load(user)}
          className="mt-6 rounded-full bg-white/10 px-6 py-3 font-bold"
        >
          Atualizar
        </button>
      </div>
    </AdminShell>
  );
}