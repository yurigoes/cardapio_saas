"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CreditCard, Banknote, QrCode,
  ChevronDown, Info, Save, Loader2, AlertCircle, CheckCircle2,
  Plus, Trash2, Star, X, Copy, Check, ExternalLink, Edit2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type PixTipo = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

interface GatewayConfig {
  pix_tipo:       PixTipo | null;
  pix_chave:      string  | null;
  pix_favorecido: string  | null;
}

interface EmpresaConfig {
  aceita_dinheiro: boolean;
  aceita_pix:      boolean;
  aceita_cartao:   boolean;
}

/** Item da lista /api/gateways (gateways_config) */
interface GatewayItem {
  id:           string;
  nome:         string;
  slug:         string;
  ambiente:     "sandbox" | "producao";
  ativo:        boolean;
  padrao:       boolean;
  webhook_url:  string | null;
  merchant_id:  string | null;
  configuracoes: Record<string, unknown>;
  created_at:   string;
}

/** Templates de gateways suportados — slug deve bater com src/lib/gateways/registry.ts */
const GATEWAY_TEMPLATES = [
  {
    slug: "mercadopago", nome: "Mercado Pago",
    cor: "#009ee3",
    descricao: "PIX + Cartão (crédito/débito)",
    instrucoes: "Painel MP → Suas integrações → Credenciais → copie o Access Token (APP_USR-... ou TEST-...)",
    field_principal: "token",
    field_principal_label: "Access Token",
    field_principal_placeholder: "APP_USR-0000000-000000-xxxxxxxx",
  },
  {
    slug: "pagarme", nome: "Pagar.me",
    cor: "#65a300",
    descricao: "PIX + Cartão tokenizado",
    instrucoes: "Painel Pagar.me → Configurações → Chaves de API → Secret Key (sk_test_... ou sk_live_...)",
    field_principal: "api_key",
    field_principal_label: "Secret Key",
    field_principal_placeholder: "sk_live_… (cole sua chave aqui)",
  },
  {
    slug: "asaas", nome: "Asaas",
    cor: "#005cab",
    descricao: "PIX + Boleto + Cartão",
    instrucoes: "Painel Asaas → Integrações → API → Access Token ($aas_prod_... ou $aas_test_...)",
    field_principal: "api_key",
    field_principal_label: "Access Token",
    field_principal_placeholder: "$aas_prod_… (cole seu token aqui)",
  },
  {
    slug: "stone", nome: "Stone",
    cor: "#00aa3b",
    descricao: "PIX + Cartão + Link",
    instrucoes: "Painel Stone OpenBank → API Credentials → use Client ID e Secret. Cole aqui o Client Secret; defina o Client ID em Configurações > Avançadas (campo client_id).",
    field_principal: "client_secret",
    field_principal_label: "Client Secret",
    field_principal_placeholder: "Cole o client_secret da OpenBank Stone",
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader(): HeadersInit {
  return { Authorization: `Bearer ${getToken()}` };
}

const PIX_TIPOS: { value: PixTipo; label: string; placeholder: string }[] = [
  { value: "cpf",       label: "CPF",          placeholder: "000.000.000-00" },
  { value: "cnpj",      label: "CNPJ",         placeholder: "00.000.000/0001-00" },
  { value: "email",     label: "E-mail",        placeholder: "seu@email.com" },
  { value: "telefone",  label: "Telefone",      placeholder: "+55 (00) 00000-0000" },
  { value: "aleatoria", label: "Chave aleatória", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand
        ${checked ? "bg-brand" : "bg-white/10"}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
          ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 divide-y divide-white/5">
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-6 py-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-4">{children}</div>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GatewaysPage() {
  // ── Local state ──────────────────────────────────────────────────────────

  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [toast,   setToast]     = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [pixOpen, setPixOpen]   = useState(false);

  // Empresa payment method toggles
  const [aceitaDinheiro, setAceitaDinheiro] = useState(false);
  const [aceitaPix,      setAceitaPix]      = useState(false);
  const [aceitaCartao,   setAceitaCartao]   = useState(false);

  // PIX detail fields
  const [pixTipo,       setPixTipo]       = useState<PixTipo>("cpf");
  const [pixChave,      setPixChave]      = useState("");
  const [pixFavorecido, setPixFavorecido] = useState("");

  // Track whether pix columns exist in DB yet
  const [pixMigrationPending, setPixMigrationPending] = useState(false);

  // Gateways online (gateways_config table)
  const [onlineGateways, setOnlineGateways] = useState<GatewayItem[]>([]);
  const [origin, setOrigin] = useState("");

  // Modal de adicionar/editar
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<GatewayItem | null>(null);
  const [formSlug, setFormSlug]     = useState<string>("mercadopago");
  const [formAmbiente, setFormAmbiente] = useState<"sandbox" | "producao">("producao");
  const [formCred, setFormCred]     = useState("");
  const [formCredSecundaria, setFormCredSecundaria] = useState(""); // ex: client_id do Stone
  const [formWebhook, setFormWebhook] = useState("");
  const [formNome, setFormNome]     = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [modalErro, setModalErro]   = useState("");
  const [copiouUrl, setCopiouUrl]   = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, gwRes, onlineRes] = await Promise.all([
        fetch("/api/painel/config",   { headers: authHeader() }),
        fetch("/api/painel/gateways", { headers: authHeader() }),
        fetch("/api/gateways",        { headers: authHeader() }),
      ]);

      if (cfgRes.ok) {
        const { data } = await cfgRes.json() as { data: EmpresaConfig };
        setAceitaDinheiro(Boolean(data.aceita_dinheiro));
        setAceitaPix(Boolean(data.aceita_pix));
        setAceitaCartao(Boolean(data.aceita_cartao));
        if (data.aceita_pix) setPixOpen(true);
      }

      if (gwRes.ok) {
        const { data } = await gwRes.json() as { data: GatewayConfig };
        if (data.pix_tipo)       setPixTipo(data.pix_tipo);
        if (data.pix_chave)      setPixChave(data.pix_chave);
        if (data.pix_favorecido) setPixFavorecido(data.pix_favorecido);
      }

      if (onlineRes.ok) {
        const { data } = await onlineRes.json() as { data: { gateways: GatewayItem[] } };
        setOnlineGateways(data.gateways ?? []);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  // Captura origin (URL base) do browser para webhook URLs
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  // ── Gateway CRUD ───────────────────────────────────────────────────────────

  function abrirModalNovo() {
    setEditing(null);
    setFormSlug("mercadopago");
    setFormAmbiente("producao");
    setFormCred("");
    setFormCredSecundaria("");
    setFormWebhook("");
    setFormNome("");
    setModalErro("");
    setModalOpen(true);
  }

  function abrirModalEditar(gw: GatewayItem) {
    setEditing(gw);
    setFormSlug(gw.slug);
    setFormAmbiente(gw.ambiente);
    setFormCred("");
    setFormCredSecundaria("");      // por segurança não pré-preenche
    setFormWebhook("");
    setFormNome(gw.nome);
    setModalErro("");
    setModalOpen(true);
  }

  async function salvarGateway() {
    setModalSaving(true);
    setModalErro("");
    try {
      const tpl = GATEWAY_TEMPLATES.find(t => t.slug === formSlug);
      const credField = tpl?.field_principal ?? "api_key";

      const body: Record<string, unknown> = {
        nome:     formNome || tpl?.nome || formSlug,
        ambiente: formAmbiente,
      };
      if (formCred.trim())    body[credField]      = formCred.trim();
      if (formWebhook.trim()) body.webhook_secret  = formWebhook.trim();
      // Stone exige client_id além do client_secret
      if (formSlug === "stone" && formCredSecundaria.trim()) {
        body.client_id = formCredSecundaria.trim();
      }

      const res = editing
        ? await fetch(`/api/gateways/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeader() },
            body: JSON.stringify(body),
          })
        : await fetch("/api/gateways", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader() },
            body: JSON.stringify({
              ...body,
              slug:  formSlug,
              ativo: true,
            }),
          });

      const data = await res.json();
      if (!data.success) {
        setModalErro(data.error || "Erro ao salvar");
        return;
      }
      setModalOpen(false);
      await fetchData();
      setToast({ type: "ok", msg: editing ? "Gateway atualizado!" : "Gateway adicionado!" });
    } catch (e) {
      setModalErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setModalSaving(false);
    }
  }

  async function tornarPadrao(id: string) {
    const res = await fetch(`/api/gateways/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body:    JSON.stringify({ padrao: true }),
    });
    if (res.ok) {
      await fetchData();
      setToast({ type: "ok", msg: "Gateway definido como padrão" });
    }
  }

  async function toggleAtivo(gw: GatewayItem) {
    const res = await fetch(`/api/gateways/${gw.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body:    JSON.stringify({ ativo: !gw.ativo }),
    });
    if (res.ok) await fetchData();
  }

  async function excluirGateway(gw: GatewayItem) {
    if (!confirm(`Excluir o gateway "${gw.nome}"? As cobranças existentes não serão afetadas.`)) return;
    const res = await fetch(`/api/gateways/${gw.id}`, {
      method: "DELETE",
      headers: authHeader(),
    });
    if (res.ok) {
      await fetchData();
      setToast({ type: "ok", msg: "Gateway removido" });
    }
  }

  function copiarWebhook(slug: string) {
    const url = `${origin}/api/webhooks/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiouUrl(slug);
      setTimeout(() => setCopiouUrl(null), 2000);
    });
  }

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Open PIX section when pix toggle is turned on
  function handlePixToggle(val: boolean) {
    setAceitaPix(val);
    if (val) setPixOpen(true);
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      // 1. Save payment method toggles
      const cfgRes = await fetch("/api/painel/config", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({
          aceita_dinheiro: aceitaDinheiro,
          aceita_pix:      aceitaPix,
          aceita_cartao:   aceitaCartao,
        }),
      });

      if (!cfgRes.ok) throw new Error("Erro ao salvar métodos de pagamento");

      // 2. Save PIX key data (may be pending migration)
      if (aceitaPix) {
        const gwRes = await fetch("/api/painel/gateways", {
          method:  "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body:    JSON.stringify({
            pix_tipo:       pixTipo,
            pix_chave:      pixChave   || null,
            pix_favorecido: pixFavorecido || null,
          }),
        });
        if (gwRes.ok) {
          const gwData = await gwRes.json();
          if (gwData.data?.pending_migration) setPixMigrationPending(true);
          else setPixMigrationPending(false);
        }
      }

      setToast({ type: "ok", msg: "Configurações salvas com sucesso!" });
    } catch (err) {
      setToast({ type: "err", msg: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  const pixTipoMeta = PIX_TIPOS.find(p => p.value === pixTipo) ?? PIX_TIPOS[0];

  return (
    <div className="space-y-8 pb-16">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-white">Gateways de Pagamento</h1>
        <p className="mt-1 text-sm text-slate-400">
          Configure os métodos de pagamento aceitos e integrações com gateways.
        </p>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition
            ${toast.type === "ok"
              ? "border-brand/20 bg-brand/10 text-brand"
              : "border-red-500/20 bg-red-500/10 text-red-400"
            }`}
        >
          {toast.type === "ok"
            ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            : <AlertCircle  className="h-4 w-4 flex-shrink-0" />
          }
          {toast.msg}
        </div>
      )}

      {/* ── Métodos Básicos ── */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Métodos Básicos
        </h2>

        <SectionCard>
          <SectionHeader
            title="Métodos de pagamento aceitos"
            subtitle="Ative os meios de pagamento que o seu estabelecimento aceita."
          />

          {/* Dinheiro */}
          <FieldRow>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10">
                  <Banknote className="h-5 w-5 text-brand" />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">Dinheiro</p>
                  <p className="text-xs text-slate-500">Pagamento em espécie no momento da entrega</p>
                </div>
              </div>
              <Toggle checked={aceitaDinheiro} onChange={setAceitaDinheiro} />
            </div>
          </FieldRow>

          {/* PIX */}
          <FieldRow>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10">
                  <QrCode className="h-5 w-5 text-sky-400" />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">PIX</p>
                  <p className="text-xs text-slate-500">Pagamento instantâneo via chave PIX</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {aceitaPix && (
                  <button
                    type="button"
                    onClick={() => setPixOpen(o => !o)}
                    className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition"
                  >
                    Configurar
                    <ChevronDown className={`h-3 w-3 transition-transform ${pixOpen ? "rotate-180" : ""}`} />
                  </button>
                )}
                <Toggle checked={aceitaPix} onChange={handlePixToggle} />
              </div>
            </div>

            {/* PIX detail fields */}
            {aceitaPix && pixOpen && (
              <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                {pixMigrationPending && (
                  <div className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    As colunas de chave PIX ainda não existem no banco de dados (migration 009 pendente).
                    Os dados foram salvos localmente mas não persistidos.
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Tipo de chave
                  </label>
                  <select
                    value={pixTipo}
                    onChange={e => setPixTipo(e.target.value as PixTipo)}
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white focus:border-brand/50 focus:outline-none"
                  >
                    {PIX_TIPOS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Chave PIX
                  </label>
                  <input
                    type="text"
                    value={pixChave}
                    onChange={e => setPixChave(e.target.value)}
                    placeholder={pixTipoMeta.placeholder}
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Nome do favorecido
                  </label>
                  <input
                    type="text"
                    value={pixFavorecido}
                    onChange={e => setPixFavorecido(e.target.value)}
                    placeholder="Nome exibido na tela de pagamento"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </FieldRow>

          {/* Cartão */}
          <FieldRow>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10">
                  <CreditCard className="h-5 w-5 text-violet-400" />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">Cartão</p>
                  <p className="text-xs text-slate-500">Débito ou crédito via maquininha física</p>
                </div>
              </div>
              <Toggle checked={aceitaCartao} onChange={setAceitaCartao} />
            </div>

            {aceitaCartao && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-xs text-violet-300">
                <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-violet-400" />
                <span>
                  O pagamento com cartão é feito diretamente na maquininha física, fora do sistema.
                  O cliente escolhe esta opção no checkout e efetua o pagamento na entrega ou balcão.
                </span>
              </div>
            )}
          </FieldRow>
        </SectionCard>
      </section>

      {/* ── Gateways Online (CRUD real) ─────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Gateways Online
          </h2>
          <button
            onClick={abrirModalNovo}
            className="flex items-center gap-2 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar gateway
          </button>
        </div>

        {onlineGateways.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-center">
            <p className="text-sm text-slate-400">Nenhum gateway online configurado.</p>
            <p className="mt-1 text-xs text-slate-500">
              Adicione Mercado Pago, Pagar.me ou Asaas para aceitar PIX e cartão online.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {onlineGateways.map((gw) => {
              const tpl = GATEWAY_TEMPLATES.find(t => t.slug === gw.slug);
              const cor = tpl?.cor ?? "#64748b";
              return (
                <div
                  key={gw.id}
                  className={`relative overflow-hidden rounded-2xl border bg-white/5 p-5 ${
                    gw.padrao ? "border-brand/40" : "border-white/10"
                  }`}
                >
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: cor }} />

                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                        style={{ background: cor + "26" }}
                      >
                        <span className="text-sm font-black leading-none" style={{ color: cor }}>
                          {gw.nome.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-white truncate">{gw.nome}</p>
                          {gw.padrao && (
                            <span className="flex items-center gap-1 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                              <Star className="h-2.5 w-2.5 fill-brand" /> PADRÃO
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {tpl?.descricao ?? gw.slug}
                          <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            gw.ambiente === "producao"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-yellow-500/15 text-yellow-400"
                          }`}>
                            {gw.ambiente}
                          </span>
                        </p>
                      </div>
                    </div>
                    <Toggle checked={gw.ativo} onChange={() => toggleAtivo(gw)} />
                  </div>

                  {/* Webhook URL */}
                  <div className="mb-3 rounded-xl border border-white/10 bg-slate-900 p-2.5">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
                      Webhook URL — cole no painel do gateway
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate text-xs text-slate-300 font-mono">
                        {origin}/api/webhooks/{gw.slug}
                      </code>
                      <button
                        onClick={() => copiarWebhook(gw.slug)}
                        className="flex-shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition"
                        title="Copiar URL"
                      >
                        {copiouUrl === gw.slug
                          ? <Check className="h-3.5 w-3.5 text-brand" />
                          : <Copy  className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2">
                    {!gw.padrao && (
                      <button
                        onClick={() => tornarPadrao(gw.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5 transition"
                      >
                        <Star className="h-3 w-3" />
                        Tornar padrão
                      </button>
                    )}
                    <button
                      onClick={() => abrirModalEditar(gw)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5 transition"
                    >
                      <Edit2 className="h-3 w-3" />
                      Editar
                    </button>
                    <button
                      onClick={() => excluirGateway(gw)}
                      className="ml-auto rounded-lg border border-red-500/20 p-1.5 text-red-400 hover:bg-red-500/10 transition"
                      title="Excluir"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Save button ── */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition"
        >
          {saving
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save     className="h-4 w-4" />
          }
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>

      {/* ── Modal: adicionar/editar gateway ──────────────────────────────── */}
      {modalOpen && (() => {
        const tpl = GATEWAY_TEMPLATES.find(t => t.slug === formSlug);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
            <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {editing ? "Editar gateway" : "Adicionar gateway"}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {editing ? "Altere credenciais ou configurações" : "Configure um novo gateway online"}
                  </p>
                </div>
                <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white transition">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Tipo de gateway (só na criação) */}
                {!editing && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Tipo de gateway
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {GATEWAY_TEMPLATES.map((t) => {
                        const ativo = formSlug === t.slug;
                        return (
                          <button
                            key={t.slug}
                            type="button"
                            onClick={() => { setFormSlug(t.slug); setFormNome(t.nome); }}
                            className={`rounded-xl border px-2 py-3 text-xs font-bold transition ${
                              ativo
                                ? "border-brand/50 bg-brand/10 text-brand"
                                : "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
                            }`}
                          >
                            {t.nome}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Instruções */}
                {tpl && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="flex items-start gap-2 text-xs text-slate-400">
                      <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-500" />
                      <span>{tpl.instrucoes}</span>
                    </p>
                  </div>
                )}

                {/* Nome (opcional) */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome de exibição</label>
                  <input
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    placeholder={tpl?.nome ?? "Nome"}
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                  />
                </div>

                {/* Ambiente */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Ambiente</label>
                  <div className="flex gap-2">
                    {(["sandbox", "producao"] as const).map((amb) => {
                      const ativo = formAmbiente === amb;
                      return (
                        <button
                          key={amb}
                          type="button"
                          onClick={() => setFormAmbiente(amb)}
                          className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold uppercase transition ${
                            ativo
                              ? amb === "producao"
                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                                : "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
                              : "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {amb === "producao" ? "Produção" : "Sandbox"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Credencial principal */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    {tpl?.field_principal_label ?? "API Key"}
                    {editing && <span className="ml-2 text-slate-600">(deixe vazio para manter)</span>}
                  </label>
                  <input
                    type="password"
                    value={formCred}
                    onChange={(e) => setFormCred(e.target.value)}
                    placeholder={tpl?.field_principal_placeholder ?? ""}
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none font-mono"
                  />
                </div>

                {/* Stone exige Client ID adicional */}
                {formSlug === "stone" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Client ID
                      {editing && <span className="ml-2 text-slate-600">(deixe vazio para manter)</span>}
                    </label>
                    <input
                      type="text"
                      value={formCredSecundaria}
                      onChange={(e) => setFormCredSecundaria(e.target.value)}
                      placeholder="ID público da aplicação Stone"
                      className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none font-mono"
                    />
                  </div>
                )}

                {/* Webhook secret (opcional) */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Webhook Secret <span className="text-slate-600">(opcional, recomendado)</span>
                  </label>
                  <input
                    type="password"
                    value={formWebhook}
                    onChange={(e) => setFormWebhook(e.target.value)}
                    placeholder="Token compartilhado para validar webhooks"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none font-mono"
                  />
                  {!editing && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
                      <ExternalLink className="h-3 w-3" />
                      Webhook URL será: {origin}/api/webhooks/{formSlug}
                    </p>
                  )}
                </div>

                {modalErro && (
                  <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                    {modalErro}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setModalOpen(false)}
                    className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={salvarGateway}
                    disabled={modalSaving || (!editing && !formCred.trim())}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-40 transition"
                  >
                    {modalSaving
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Save    className="h-4 w-4" />}
                    {editing ? "Salvar" : "Adicionar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
