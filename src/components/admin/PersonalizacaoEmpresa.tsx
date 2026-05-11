"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Save, Wand2, XCircle } from "lucide-react";
import MinioUploadField from "@/components/admin/MinioUploadField";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

function slugify(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureDoubleSlug(value: string) {
  const clean = slugify(value);
  if (!clean) return "";
  if (clean.includes("-")) return clean;
  return `${clean}-${clean}`;
}

export default function PersonalizacaoEmpresa({ empresaId, empresa, onReloadEmpresa }: { empresaId: string; empresa?: any; onReloadEmpresa?: () => void }) {
  const [form, setForm] = useState<any>({});
  const [slugStatus, setSlugStatus] = useState<null | "ok" | "erro" | "checking">(null);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    setForm({
      nome_fantasia: empresa?.nome_fantasia || "",
      slug: empresa?.slug || "",
      logo_url: empresa?.logo_url || "",
      banner_url: empresa?.banner_url || "",
      cor_primaria: empresa?.cor_primaria || "#d9b35f",
      cnpj: empresa?.cnpj || "",
      whatsapp_pedidos: empresa?.whatsapp_pedidos || "",
      subdominio: empresa?.subdominio || ""
    });
  }, [empresa]);

  function update(key: string, value: string) {
    setForm((current: any) => ({ ...current, [key]: value }));
    if (key === "slug") setSlugStatus(null);
  }

  async function verificarSlug(slugValue = form.slug) {
    const slug = ensureDoubleSlug(slugValue);
    update("slug", slug);
    if (!slug) return;

    try {
      setSlugStatus("checking");
      const res = await fetch(`${API}/api/cardapio/admin/slug/check?slug=${encodeURIComponent(slug)}&exclude_id=${empresaId}`, { cache: "no-store" });
      const data = await res.json();
      setSlugStatus(data?.disponivel ? "ok" : "erro");
    } catch {
      setSlugStatus("erro");
    }
  }

  function gerarSlug() {
    const generated = ensureDoubleSlug(form.nome_fantasia);
    update("slug", generated);
    verificarSlug(generated);
  }

  async function salvar(event: FormEvent) {
    event.preventDefault();

    try {
      setErro("");
      setSucesso("");
      const slugFinal = ensureDoubleSlug(form.slug);
      if (!slugFinal.includes("-")) throw new Error("O slug precisa seguir o padrão slug-slug.");

      const res = await fetch(`${API}/api/cardapio/admin/empresas/${empresaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa: { ...form, slug: slugFinal } })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao salvar personalização.");
      setSucesso("Personalização salva com sucesso.");
      onReloadEmpresa?.();
    } catch (error: any) {
      setErro(error?.message || "Erro ao salvar personalização.");
    }
  }

  const slugAtual = form.slug || empresa?.slug || empresa?.subdominio || `empresa-${empresaId}`;

  return (
    <section className="space-y-6 text-white">
      <header><h1 className="text-3xl font-black">Personalização</h1><p className="mt-1 text-sm text-zinc-400">Identidade visual, logo, banner, nome, slug, CNPJ e dados principais.</p></header>
      {erro && <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-200">{erro}</div>}
      {sucesso && <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-emerald-200">{sucesso}</div>}

      <form onSubmit={salvar} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_.9fr]">
          <div className="grid gap-4 md:grid-cols-2">
            <Campo label="Nome fantasia"><input value={form.nome_fantasia || ""} onChange={(e) => update("nome_fantasia", e.target.value)} className="input-admin" /></Campo>
            <Campo label="CNPJ"><input value={form.cnpj || ""} onChange={(e) => update("cnpj", e.target.value)} className="input-admin" /></Campo>
            <Campo label="Slug"><div className="flex gap-2"><input value={form.slug || ""} onChange={(e) => update("slug", e.target.value)} className="input-admin flex-1" /><button type="button" onClick={gerarSlug} className="rounded-2xl bg-white/10 px-4 font-black hover:bg-white/20"><Wand2 className="h-4 w-4" /></button><button type="button" onClick={() => verificarSlug()} className="rounded-2xl bg-white/10 px-4 font-black hover:bg-white/20"><RefreshCw className="h-4 w-4" /></button></div><div className="mt-2 text-xs">{slugStatus === "ok" && <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3 w-3" />Slug disponível</span>}{slugStatus === "erro" && <span className="flex items-center gap-1 text-red-300"><XCircle className="h-3 w-3" />Slug indisponível ou inválido</span>}{slugStatus === "checking" && <span className="text-zinc-400">Verificando slug...</span>}{!slugStatus && <span className="text-zinc-500">Padrão obrigatório: slug-slug</span>}</div></Campo>
            <Campo label="Subdomínio"><input value={form.subdominio || ""} onChange={(e) => update("subdominio", e.target.value)} className="input-admin" /></Campo>
            <Campo label="Cor primária"><div className="flex gap-3"><input type="color" value={form.cor_primaria || "#d9b35f"} onChange={(e) => update("cor_primaria", e.target.value)} className="h-12 w-16 rounded-xl bg-transparent" /><input value={form.cor_primaria || ""} onChange={(e) => update("cor_primaria", e.target.value)} className="input-admin flex-1" /></div></Campo>
            <Campo label="WhatsApp pedidos"><input value={form.whatsapp_pedidos || ""} onChange={(e) => update("whatsapp_pedidos", e.target.value)} className="input-admin" /></Campo>
            <Campo label="Logo URL"><input value={form.logo_url || ""} onChange={(e) => update("logo_url", e.target.value)} className="input-admin" /></Campo>
            <Campo label="Banner URL"><input value={form.banner_url || ""} onChange={(e) => update("banner_url", e.target.value)} className="input-admin" /></Campo>
          </div>

          <div className="space-y-4">
            <MinioUploadField empresaId={empresaId} slug={slugAtual} tipo="logo" label="Logo da empresa" value={form.logo_url || ""} table="empresas_cardapio" recordId={empresaId} field="logo_url" onChange={(url) => update("logo_url", url)} />
            <MinioUploadField empresaId={empresaId} slug={slugAtual} tipo="banner" label="Banner da empresa" value={form.banner_url || ""} table="empresas_cardapio" recordId={empresaId} field="banner_url" onChange={(url) => update("banner_url", url)} />
          </div>
        </div>

        <button type="submit" className="mt-6 flex items-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 font-black text-black hover:bg-emerald-300"><Save className="h-4 w-4" />Salvar personalização</button>
      </form>
      <style jsx global>{`.input-admin{width:100%;border-radius:1rem;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);padding:.85rem 1rem;color:white;outline:none}.input-admin:focus{border-color:rgba(52,211,153,.8)}`}</style>
    </section>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-2 block text-sm font-bold text-zinc-400">{label}</span>{children}</label>; }
