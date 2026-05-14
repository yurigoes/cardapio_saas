"use client";

import { useEffect, useState } from "react";
import { getAdminUser } from "@/lib/adminAuth";
import AdminShell from "@/components/admin/AdminShell";
import { AdminField } from "@/components/admin/AdminField";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API || "https://connect.yugochat.com.br";

export default function EditarEmpresaPage({
  params
}: {
  params: { id: string };
}) {
  const [user, setUser] = useState<any>(null);
  const [empresa, setEmpresa] = useState<any>(null);
  const [licenca, setLicenca] = useState<any>(null);
  const [mensalidade, setMensalidade] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch(`${API}/api/cardapio/admin/empresas/${params.id}`);
    const data = await res.json();

    setEmpresa(data.empresa);
    setLicenca(data.licenca);
    setMensalidade(data.mensalidades?.[0] || null);
  }

  useEffect(() => {
    const adminUser = getAdminUser();

    if (!adminUser) {
      window.location.href = "/admin/login";
      return;
    }

    if (
      adminUser.role === "Admin" &&
      Number(adminUser.empresa_id) !== Number(params.id)
    ) {
      window.location.href = "/admin";
      return;
    }

    setUser(adminUser);
    load();
  }, [params.id]);

  function updateEmpresa(name: string, value: any) {
    setEmpresa((current: any) => ({ ...current, [name]: value }));
  }

  function updateLicenca(name: string, value: any) {
    setLicenca((current: any) => ({ ...current, [name]: value }));
  }

  function updateMensalidade(name: string, value: any) {
    setMensalidade((current: any) => ({ ...current, [name]: value }));
  }

  async function salvar() {
    setLoading(true);

    const res = await fetch(`${API}/api/cardapio/admin/empresas/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa, licenca, mensalidade })
    });

    const data = await res.json();
    setLoading(false);

    if (data.sucesso) {
      alert("Salvo com sucesso!");
      await load();
    } else {
      alert(JSON.stringify(data));
    }
  }

  if (!user || !empresa) {
    return (
      <AdminShell>
        <div className="min-h-screen p-10">Carregando...</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">Editar empresa</h1>
            <p className="mt-2 text-zinc-400">{empresa.nome_fantasia}</p>
          </div>

          <a href="/admin" className="rounded-full bg-white/10 px-5 py-3">
            Voltar
          </a>
        </div>

        <div className="mt-8 grid gap-6">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            <h2 className="mb-4 text-xl font-bold">Empresa</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <AdminField label="Nome fantasia">
                <input value={empresa.nome_fantasia || ""} onChange={(e) => updateEmpresa("nome_fantasia", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Slug">
                <input value={empresa.slug || ""} onChange={(e) => updateEmpresa("slug", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Subdomínio">
                <input value={empresa.subdominio || ""} onChange={(e) => updateEmpresa("subdominio", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Domínio próprio">
                <input value={empresa.dominio_proprio || ""} onChange={(e) => updateEmpresa("dominio_proprio", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Logo URL">
                <input value={empresa.logo_url || ""} onChange={(e) => updateEmpresa("logo_url", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Vídeo de fundo URL">
                <input value={empresa.video_fundo_url || ""} onChange={(e) => updateEmpresa("video_fundo_url", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="WhatsApp de pedidos">
                <input value={empresa.whatsapp_pedidos || ""} onChange={(e) => updateEmpresa("whatsapp_pedidos", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Cor primária">
                <input value={empresa.cor_primaria || ""} onChange={(e) => updateEmpresa("cor_primaria", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Status da empresa">
                <select value={empresa.status || "Ativo"} onChange={(e) => updateEmpresa("status", e.target.value)} className="rounded-xl bg-zinc-900 p-3">
                  <option>Ativo</option>
                  <option>Inativo</option>
                </select>
              </AdminField>

              <AdminField label="Orientação do totem">
                <select value={empresa.orientacao_totem || "Horizontal"} onChange={(e) => updateEmpresa("orientacao_totem", e.target.value)} className="rounded-xl bg-zinc-900 p-3">
                  <option>Horizontal</option>
                  <option>Vertical</option>
                </select>
              </AdminField>

              <label className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3">
                <input type="checkbox" checked={!!empresa.usar_dominio_proprio} onChange={(e) => updateEmpresa("usar_dominio_proprio", e.target.checked)} />
                Usar domínio próprio
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            <h2 className="mb-4 text-xl font-bold">Pagamentos e integrações</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3">
                <input type="checkbox" checked={!!empresa.pagamento_dinheiro} onChange={(e) => updateEmpresa("pagamento_dinheiro", e.target.checked)} />
                Dinheiro
              </label>

              <label className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3">
                <input type="checkbox" checked={!!empresa.pagamento_pix} onChange={(e) => updateEmpresa("pagamento_pix", e.target.checked)} />
                Pix
              </label>

              <label className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3">
                <input type="checkbox" checked={!!empresa.pagamento_cartao_pinpad} onChange={(e) => updateEmpresa("pagamento_cartao_pinpad", e.target.checked)} />
                Cartão Pinpad
              </label>

              <AdminField label="Mercado Pago Public Key">
                <input value={empresa.mercado_pago_public_key || ""} onChange={(e) => updateEmpresa("mercado_pago_public_key", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Mercado Pago Access Token">
                <input value={empresa.mercado_pago_access_token || ""} onChange={(e) => updateEmpresa("mercado_pago_access_token", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Provedor Pinpad">
                <select value={empresa.pinpad_provider || "Nenhum"} onChange={(e) => updateEmpresa("pinpad_provider", e.target.value)} className="rounded-xl bg-zinc-900 p-3">
                  <option>Nenhum</option>
                  <option>Mercado Pago Point</option>
                  <option>Stone</option>
                  <option>Cielo</option>
                  <option>Rede</option>
                </select>
              </AdminField>

              <AdminField label="Configuração Pinpad JSON">
                <textarea value={empresa.pinpad_config_json || ""} onChange={(e) => updateEmpresa("pinpad_config_json", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Sistema restaurante">
                <select value={empresa.sistema_restaurante_provider || "Nenhum"} onChange={(e) => updateEmpresa("sistema_restaurante_provider", e.target.value)} className="rounded-xl bg-zinc-900 p-3">
                  <option>Nenhum</option>
                  <option>Consumer</option>
                  <option>Saipos</option>
                  <option>Anota AI</option>
                  <option>iFood</option>
                  <option>Próprio</option>
                  <option>Outro</option>
                </select>
              </AdminField>

              <AdminField label="URL da API do sistema">
                <input value={empresa.sistema_restaurante_api_url || ""} onChange={(e) => updateEmpresa("sistema_restaurante_api_url", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Token do sistema">
                <input value={empresa.sistema_restaurante_token || ""} onChange={(e) => updateEmpresa("sistema_restaurante_token", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>

              <AdminField label="Configuração do sistema JSON">
                <textarea value={empresa.sistema_restaurante_config_json || ""} onChange={(e) => updateEmpresa("sistema_restaurante_config_json", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
              </AdminField>
            </div>
          </section>

          {licenca && (
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
              <h2 className="mb-4 text-xl font-bold">Licença</h2>

              <div className="grid gap-4 md:grid-cols-2">
                <AdminField label="Status da licença">
                  <select value={licenca.status || "Ativa"} onChange={(e) => updateLicenca("status", e.target.value)} className="rounded-xl bg-zinc-900 p-3">
                    <option>Ativa</option>
                    <option>Bloqueada</option>
                    <option>Expirada</option>
                    <option>Cancelada</option>
                  </select>
                </AdminField>

                <AdminField label="Data fim da licença">
                  <input value={licenca.data_fim || ""} onChange={(e) => updateLicenca("data_fim", e.target.value)} placeholder="YYYY-MM-DD" className="rounded-xl bg-zinc-900 p-3" />
                </AdminField>

                <label className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3">
                  <input type="checkbox" checked={!!licenca.trial_ativo} onChange={(e) => updateLicenca("trial_ativo", e.target.checked)} />
                  Trial ativo
                </label>

                <AdminField label="Minutos extras de trial">
                  <input value={licenca.trial_liberado_por_dev || 0} onChange={(e) => updateLicenca("trial_liberado_por_dev", Number(e.target.value))} className="rounded-xl bg-zinc-900 p-3" />
                </AdminField>
              </div>
            </section>
          )}

          {mensalidade && (
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
              <h2 className="mb-4 text-xl font-bold">Mensalidade</h2>

              <div className="grid gap-4 md:grid-cols-2">
                <AdminField label="Status da mensalidade">
                  <select value={mensalidade.status || "Pendente"} onChange={(e) => updateMensalidade("status", e.target.value)} className="rounded-xl bg-zinc-900 p-3">
                    <option>Pendente</option>
                    <option>Pago</option>
                    <option>Atrasado</option>
                    <option>Cancelado</option>
                  </select>
                </AdminField>

                <AdminField label="Valor">
                  <input value={mensalidade.valor || ""} onChange={(e) => updateMensalidade("valor", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
                </AdminField>

                <AdminField label="Data de vencimento">
                  <input value={mensalidade.data_vencimento || ""} onChange={(e) => updateMensalidade("data_vencimento", e.target.value)} placeholder="YYYY-MM-DD" className="rounded-xl bg-zinc-900 p-3" />
                </AdminField>

                <AdminField label="Checkout URL atual">
                  <input value={mensalidade.checkout_url || ""} onChange={(e) => updateMensalidade("checkout_url", e.target.value)} className="rounded-xl bg-zinc-900 p-3" />
                </AdminField>
              </div>
            </section>
          )}

          <button onClick={salvar} disabled={loading} className="rounded-2xl bg-emerald-500 p-4 text-lg font-black text-white disabled:opacity-60">
            {loading ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </AdminShell>
  );
}