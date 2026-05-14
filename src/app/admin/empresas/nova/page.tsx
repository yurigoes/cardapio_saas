"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { getAdminUser } from "@/lib/adminAuth";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API || "https://connect.yugochat.com.br";

function gerarSlug(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function NovaEmpresaPage() {
  const [user, setUser] = useState<any>(null);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "ok" | "erro">("idle");
  const [slugMsg, setSlugMsg] = useState("");
  const [modal, setModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    loading?: boolean;
    link?: string;
  }>({
    open: false,
    title: "",
    message: ""
  });

  const [form, setForm] = useState<any>({
    nome_fantasia: "",
    slug: "",
    logo_url: "",
    cor_primaria: "#d9b35f",
    status: "Ativo",
    subdominio: "",
    dominio_proprio: "",
    usar_dominio_proprio: false,
    status_dominio: "Pendente",
    ssl_status: "Pendente",
    video_fundo_url: "",
    whatsapp_pedidos: "",
    pagamento_dinheiro: true,
    pagamento_pix: false,
    pagamento_cartao_pinpad: false,
    mercado_pago_public_key: "",
    mercado_pago_access_token: "",
    pinpad_provider: "Nenhum",
    pinpad_config_json: "",
    sistema_restaurante_provider: "",
    sistema_restaurante_api_url: "",
    sistema_restaurante_token: "",
    sistema_restaurante_config_json: "",
    orientacao_totem: "Horizontal",

    admin_nome: "",
    admin_email: "",
    admin_senha: "",
    admin_role: "Admin",

    licenca_status: "Ativa",
    licenca_data_inicio: new Date().toISOString().slice(0, 10),
    licenca_data_fim: "",
    dias_gratis: 30,
    motivo_bloqueio: "",
    trial_total_minutos: 0,
    trial_usado_minutos: 0,
    trial_ativo: false,
    trial_expirado: false,
    trial_liberado_por_dev: 0,

    criar_mensalidade: true,
    valor_mensalidade: 99.9,
    descricao_mensalidade: "",
    periodicidade: "Mensal",
    data_vencimento: "",
    dia_vencimento: "",
    mensalidade_status: "Pendente"
  });

  useEffect(() => {
    const adminUser = getAdminUser();

    if (!adminUser) {
      window.location.href = "/admin/login";
      return;
    }

    if (adminUser.role !== "ADM") {
      window.location.href = "/admin";
      return;
    }

    setUser(adminUser);
  }, []);

  useEffect(() => {
    if (!form.slug) {
      setSlugStatus("idle");
      setSlugMsg("");
      return;
    }

    const timer = setTimeout(async () => {
      setSlugStatus("checking");
      setSlugMsg("Verificando disponibilidade...");

      try {
        const res = await fetch(
          `${API}/api/cardapio/admin/slug/check?slug=${encodeURIComponent(form.slug)}`,
          { cache: "no-store" }
        );

        const data = await res.json();

        if (data.disponivel) {
          setSlugStatus("ok");
          setSlugMsg("Slug disponível.");
        } else {
          setSlugStatus("erro");
          setSlugMsg("Slug indisponível.");
        }
      } catch {
        setSlugStatus("erro");
        setSlugMsg("Erro ao verificar slug.");
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [form.slug]);

  const slugDisponivel = slugStatus === "ok";

  function update(field: string, value: any) {
    setForm((current: any) => ({
      ...current,
      [field]: value
    }));
  }

  function updateNomeFantasia(value: string) {
    setForm((current: any) => {
      const slugAtualFoiAutomatico =
        !current.slug || current.slug === gerarSlug(current.nome_fantasia || "");

      const novoSlug = slugAtualFoiAutomatico ? gerarSlug(value) : current.slug;

      return {
        ...current,
        nome_fantasia: value,
        slug: novoSlug,
        subdominio: current.subdominio || novoSlug.replace(/-/g, "")
      };
    });
  }

  const payload = useMemo(() => {
    const dataFim =
      form.licenca_data_fim ||
      (() => {
        const d = new Date(`${form.licenca_data_inicio}T12:00:00`);
        d.setDate(d.getDate() + Number(form.dias_gratis || 30));
        return d.toISOString().slice(0, 10);
      })();

    const dataVencimento = form.data_vencimento || dataFim;

    return {
      ...form,
      licenca_data_fim: dataFim,
      data_vencimento: dataVencimento,
      dia_vencimento:
        form.dia_vencimento ||
        new Date(`${dataVencimento}T12:00:00`).getDate(),
      descricao_mensalidade:
        form.descricao_mensalidade ||
        `Mensalidade Cardápio Digital - ${form.nome_fantasia}`,
      pagamento_dinheiro: !!form.pagamento_dinheiro,
      pagamento_pix: !!form.pagamento_pix,
      pagamento_cartao_pinpad: !!form.pagamento_cartao_pinpad,
      usar_dominio_proprio: !!form.usar_dominio_proprio,
      trial_ativo: !!form.trial_ativo,
      trial_expirado: !!form.trial_expirado,
      criar_mensalidade: !!form.criar_mensalidade
    };
  }, [form]);

  async function cadastrarEmpresa() {
    if (!slugDisponivel) {
      setModal({
        open: true,
        title: "Slug indisponível",
        message: "Escolha outro slug antes de cadastrar."
      });
      return;
    }

    setModal({
      open: true,
      title: "Cadastrando empresa",
      message: "Gravando dados no NocoDB...",
      loading: true
    });

    try {
      const res = await fetch(`${API}/api/cardapio/admin/empresas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.sucesso) {
        setModal({
          open: true,
          title: "Erro ao cadastrar",
          message: data.error || data.message || "Não foi possível cadastrar a empresa."
        });
        return;
      }

      setModal({
        open: true,
        title: "Empresa criada com sucesso",
        message: "Os dados foram gravados no NocoDB e a licença foi criada.",
        link: data.urls?.slug
      });
    } catch {
      setModal({
        open: true,
        title: "Erro de conexão",
        message: "Não foi possível conectar ao backend."
      });
    }
  }

  if (!user) {
    return (
      <AdminShell>
        <div className="p-10 text-white">Carregando...</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <main className="mx-auto max-w-7xl p-8 text-white">
        <div className="mb-8">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-300">
            Cadastro SaaS
          </p>

          <h1 className="mt-3 text-4xl font-black">Nova empresa</h1>
        </div>

        <div className="grid gap-6">
          <Section title="Dados principais">
            <Input label="Nome fantasia" value={form.nome_fantasia} onChange={updateNomeFantasia} />
            <Input
              label="Slug"
              value={form.slug}
              onChange={(v) => update("slug", gerarSlug(v))}
              status={slugStatus}
              helper={slugMsg}
            />
            <Input label="Subdomínio" value={form.subdominio} onChange={(v) => update("subdominio", v.replace(/\W/g, "").toLowerCase())} />
            <Input label="Logo URL" value={form.logo_url} onChange={(v) => update("logo_url", v)} />
            <Input label="Vídeo fundo URL" value={form.video_fundo_url} onChange={(v) => update("video_fundo_url", v)} />
            <Input label="Cor primária" value={form.cor_primaria} onChange={(v) => update("cor_primaria", v)} type="color" />
            <Select label="Status" value={form.status} onChange={(v) => update("status", v)} options={["Ativo", "Inativo", "Bloqueado"]} />
            <Select label="Orientação Totem" value={form.orientacao_totem} onChange={(v) => update("orientacao_totem", v)} options={["Horizontal", "Vertical"]} />
          </Section>

          <Section title="Domínio e SSL">
            <Input label="Domínio próprio" value={form.dominio_proprio} onChange={(v) => update("dominio_proprio", v)} />
            <Check label="Usar domínio próprio" checked={form.usar_dominio_proprio} onChange={(v) => update("usar_dominio_proprio", v)} />
            <Select label="Status domínio" value={form.status_dominio} onChange={(v) => update("status_dominio", v)} options={["Pendente", "Configurado", "Erro"]} />
            <Select label="SSL status" value={form.ssl_status} onChange={(v) => update("ssl_status", v)} options={["Pendente", "Ativo", "Erro"]} />
          </Section>

          <Section title="Pagamentos e integrações">
            <Input label="WhatsApp pedidos" value={form.whatsapp_pedidos} onChange={(v) => update("whatsapp_pedidos", v)} />
            <Check label="Dinheiro" checked={form.pagamento_dinheiro} onChange={(v) => update("pagamento_dinheiro", v)} />
            <Check label="Pix" checked={form.pagamento_pix} onChange={(v) => update("pagamento_pix", v)} />
            <Check label="Cartão Pinpad" checked={form.pagamento_cartao_pinpad} onChange={(v) => update("pagamento_cartao_pinpad", v)} />
            <Input label="Mercado Pago Public Key" value={form.mercado_pago_public_key} onChange={(v) => update("mercado_pago_public_key", v)} />
            <Input label="Mercado Pago Access Token" value={form.mercado_pago_access_token} onChange={(v) => update("mercado_pago_access_token", v)} />
            <Select label="Pinpad Provider" value={form.pinpad_provider} onChange={(v) => update("pinpad_provider", v)} options={["Nenhum", "Mercado Pago", "Stone", "Cielo", "PagSeguro"]} />
            <TextArea label="Pinpad Config JSON" value={form.pinpad_config_json} onChange={(v) => update("pinpad_config_json", v)} />
            <Input label="Sistema Restaurante Provider" value={form.sistema_restaurante_provider} onChange={(v) => update("sistema_restaurante_provider", v)} />
            <Input label="Sistema Restaurante API URL" value={form.sistema_restaurante_api_url} onChange={(v) => update("sistema_restaurante_api_url", v)} />
            <Input label="Sistema Restaurante Token" value={form.sistema_restaurante_token} onChange={(v) => update("sistema_restaurante_token", v)} />
            <TextArea label="Sistema Restaurante Config JSON" value={form.sistema_restaurante_config_json} onChange={(v) => update("sistema_restaurante_config_json", v)} />
          </Section>

          <Section title="Usuário administrador">
            <Input label="Nome admin" value={form.admin_nome} onChange={(v) => update("admin_nome", v)} />
            <Input label="Email admin" value={form.admin_email} onChange={(v) => update("admin_email", v)} />
            <Input label="Senha admin" value={form.admin_senha} onChange={(v) => update("admin_senha", v)} type="password" />
            <Select label="Role" value={form.admin_role} onChange={(v) => update("admin_role", v)} options={["Admin", "ADM"]} />
          </Section>

          <Section title="Licença">
            <Select label="Status licença" value={form.licenca_status} onChange={(v) => update("licenca_status", v)} options={["Ativa", "Bloqueada", "Expirada", "Cancelada"]} />
            <Input label="Data início" value={form.licenca_data_inicio} onChange={(v) => update("licenca_data_inicio", v)} type="date" />
            <Input label="Data fim" value={payload.licenca_data_fim} onChange={(v) => update("licenca_data_fim", v)} type="date" />
            <Input label="Dias grátis" value={form.dias_gratis} onChange={(v) => update("dias_gratis", Number(v))} type="number" />
            <Input label="Motivo bloqueio" value={form.motivo_bloqueio} onChange={(v) => update("motivo_bloqueio", v)} />
            <Check label="Trial ativo" checked={form.trial_ativo} onChange={(v) => update("trial_ativo", v)} />
            <Check label="Trial expirado" checked={form.trial_expirado} onChange={(v) => update("trial_expirado", v)} />
            <Input label="Trial total minutos" value={form.trial_total_minutos} onChange={(v) => update("trial_total_minutos", Number(v))} type="number" />
            <Input label="Trial usado minutos" value={form.trial_usado_minutos} onChange={(v) => update("trial_usado_minutos", Number(v))} type="number" />
            <Input label="Trial liberado por dev" value={form.trial_liberado_por_dev} onChange={(v) => update("trial_liberado_por_dev", Number(v))} type="number" />
          </Section>

          <Section title="Mensalidade">
            <Check label="Criar mensalidade" checked={form.criar_mensalidade} onChange={(v) => update("criar_mensalidade", v)} />
            <Input label="Valor mensalidade" value={form.valor_mensalidade} onChange={(v) => update("valor_mensalidade", Number(v))} type="number" />
            <Input label="Descrição" value={payload.descricao_mensalidade} onChange={(v) => update("descricao_mensalidade", v)} />
            <Select label="Periodicidade" value={form.periodicidade} onChange={(v) => update("periodicidade", v)} options={["Mensal", "Trimestral", "Semestral", "Anual"]} />
            <Input label="Data vencimento" value={payload.data_vencimento} onChange={(v) => update("data_vencimento", v)} type="date" />
            <Input label="Dia vencimento" value={payload.dia_vencimento} onChange={(v) => update("dia_vencimento", Number(v))} type="number" />
            <Select label="Status mensalidade" value={form.mensalidade_status} onChange={(v) => update("mensalidade_status", v)} options={["Pendente", "Pago", "Cancelado", "Vencido"]} />
          </Section>

          <button
            onClick={cadastrarEmpresa}
            disabled={!slugDisponivel}
            className="rounded-full bg-emerald-500 px-8 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:bg-red-500"
          >
            Cadastrar empresa
          </button>
        </div>

        {modal.open && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 px-6 backdrop-blur-xl">
            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-center text-white shadow-2xl">
              {modal.loading && (
                <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-emerald-400" />
              )}

              <h2 className="text-3xl font-black">{modal.title}</h2>
              <p className="mt-4 text-zinc-300">{modal.message}</p>

              {modal.link && (
                <a
                  href={modal.link}
                  target="_blank"
                  className="mt-5 block rounded-2xl bg-emerald-500 px-5 py-4 font-black text-white"
                >
                  Abrir empresa criada
                </a>
              )}

              {!modal.loading && (
                <button
                  onClick={() => setModal({ open: false, title: "", message: "" })}
                  className="mt-4 rounded-full bg-white/10 px-6 py-3 font-bold"
                >
                  Fechar
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </AdminShell>
  );
}

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

function Section({ title, children }: SectionProps) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
      <h2 className="mb-5 text-2xl font-black">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

type InputProps = {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  status?: "idle" | "checking" | "ok" | "erro";
  helper?: string;
};

function Input({
  label,
  value,
  onChange,
  type = "text",
  status,
  helper
}: InputProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-zinc-400">
        {label}
      </span>

      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-2xl bg-black/30 p-4 outline-none ring-1 ${
          status === "ok"
            ? "ring-emerald-400"
            : status === "erro"
            ? "ring-red-400"
            : "ring-white/10"
        }`}
      />

      {helper && (
        <p
          className={`mt-2 text-sm ${
            status === "ok" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {helper}
        </p>
      )}
    </label>
  );
}

type SelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
};

function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-zinc-400">
        {label}
      </span>

      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl bg-black/30 p-4 outline-none ring-1 ring-white/10"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-zinc-950">
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

type CheckProps = {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

function Check({ label, checked, onChange }: CheckProps) {
  return (
    <label className="flex items-center gap-3 rounded-2xl bg-black/30 p-4">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />

      <span className="font-bold">{label}</span>
    </label>
  );
}

type TextAreaProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function TextArea({ label, value, onChange }: TextAreaProps) {
  return (
    <label className="block md:col-span-2">
      <span className="mb-2 block text-sm font-bold text-zinc-400">
        {label}
      </span>

      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-28 w-full rounded-2xl bg-black/30 p-4 outline-none ring-1 ring-white/10"
      />
    </label>
  );
}