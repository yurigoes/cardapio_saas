"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Palette, Phone, CreditCard, Award, Monitor,
  Upload, Save, Eye, Sun, Moon, ToggleLeft, ToggleRight,
  CheckCircle, AlertCircle, Loader2, Video, ImageIcon, ExternalLink,
  DollarSign,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface EmpresaConfig {
  nome_fantasia:     string;
  descricao:         string;
  logo_url:          string;
  banner_url:        string;
  cor_primaria:      string;
  cor_secundaria:    string;
  tema:              "dark" | "light";
  whatsapp:          string;
  telefone:          string;
  email:             string;
  horario_abertura:  string;
  horario_fechamento: string;
  dias_funcionamento: string;
  aceita_dinheiro:       boolean;
  aceita_pix:            boolean;
  aceita_cartao:         boolean;
  caixa_obrigatorio:     boolean;
  imprimir_cozinha_auto: boolean;
  imprimir_cupom_auto:   boolean;
  taxa_entrega:          number;
  pedido_minimo:     number;
  tempo_entrega_min: number;
  fidelidade_ativo:    boolean;
  pontos_por_real:     number;
  real_por_ponto:      number;
  cashback_ativo:      boolean;
  cashback_percentual: number;
  // Totem customization
  totem_bg_video_url: string;
  totem_bg_image_url: string;
  totem_cta_text:     string;
  totem_slogan:       string;
}

type Tab = "identidade" | "contato" | "pagamentos" | "fidelidade" | "totem";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader() { return { Authorization: `Bearer ${getToken()}` }; }

const DEFAULT_CONFIG: EmpresaConfig = {
  nome_fantasia:      "",
  descricao:          "",
  logo_url:           "",
  banner_url:         "",
  cor_primaria:       "#10b981",
  cor_secundaria:     "#1e293b",
  tema:               "dark",
  whatsapp:           "",
  telefone:           "",
  email:              "",
  horario_abertura:   "08:00",
  horario_fechamento: "22:00",
  dias_funcionamento: "",
  aceita_dinheiro:        true,
  aceita_pix:             true,
  aceita_cartao:          true,
  caixa_obrigatorio:      false,
  imprimir_cozinha_auto:  false,
  imprimir_cupom_auto:    false,
  taxa_entrega:           0,
  pedido_minimo:      0,
  tempo_entrega_min:  30,
  fidelidade_ativo:    false,
  pontos_por_real:     1,
  real_por_ponto:      0.01,
  cashback_ativo:      false,
  cashback_percentual: 5,
  totem_bg_video_url: "",
  totem_bg_image_url: "",
  totem_cta_text:     "Toque para fazer seu pedido",
  totem_slogan:       "",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex-shrink-0 transition"
      aria-checked={checked}
      role="switch"
    >
      {checked
        ? <ToggleRight className="h-7 w-7 text-brand" />
        : <ToggleLeft  className="h-7 w-7 text-slate-500" />
      }
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-400 mb-1.5">{children}</label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none transition ${props.className ?? ""}`}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none transition resize-none ${props.className ?? ""}`}
    />
  );
}

// ── Image Upload Field ─────────────────────────────────────────────────────────

function ImageField({
  label,
  value,
  onChange,
}: {
  label:    string;
  value:    string;
  onChange: (url: string) => void;
}) {
  const ref        = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr]             = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("referencia", "empresa");
      const res  = await fetch("/api/upload", {
        method:  "POST",
        headers: authHeader(),
        body:    fd,
      });
      const data = await res.json();
      if (data.success && data.url) {
        onChange(data.url);
      } else {
        setErr(data.error ?? "Erro ao fazer upload");
      }
    } catch {
      setErr("Falha na conexão ao fazer upload");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {value && (
        <div className="relative w-full h-32 rounded-xl overflow-hidden border border-white/10 bg-white/5">
          <img
            src={value}
            alt={label}
            className="h-full w-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://..."
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-50 transition flex-shrink-0"
        >
          {uploading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Upload className="h-4 w-4" />
          }
          {uploading ? "Enviando..." : "Enviar"}
        </button>
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

// ── Color Field ────────────────────────────────────────────────────────────────

function ColorField({
  label,
  value,
  onChange,
}: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2 items-center">
        <div className="relative flex-shrink-0">
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="h-10 w-10 cursor-pointer rounded-xl border border-white/10 bg-transparent p-0.5"
            title={label}
          />
        </div>
        <Input
          value={value}
          onChange={e => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
          }}
          placeholder="#10b981"
          className="font-mono uppercase"
        />
      </div>
    </div>
  );
}

// ── Color Preview Card ─────────────────────────────────────────────────────────

function ColorPreview({ corPrimaria, corSecundaria, nomFantasia }: {
  corPrimaria:   string;
  corSecundaria: string;
  nomFantasia:   string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="h-4 w-4 text-slate-400" />
        <span className="text-xs font-medium text-slate-400">Pré-visualização das cores</span>
      </div>
      <div
        className="rounded-xl overflow-hidden shadow-lg"
        style={{ background: corSecundaria || "#1e293b" }}
      >
        {/* fake menu header */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ background: corPrimaria || "#10b981" }}
        >
          <span className="font-bold text-white text-sm truncate">
            {nomFantasia || "Nome da Empresa"}
          </span>
          <span className="text-white/80 text-xs">Cardápio</span>
        </div>
        {/* fake product card */}
        <div className="p-4 space-y-2">
          {[
            { name: "X-Burguer", price: "R$ 25,90" },
            { name: "Coca-Cola 350ml", price: "R$ 7,00" },
          ].map(item => (
            <div
              key={item.name}
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              <span className="text-white text-xs">{item.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: corPrimaria || "#10b981" }}>
                  {item.price}
                </span>
                <button
                  className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
                  style={{ background: corPrimaria || "#10b981" }}
                >+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [tab,     setTab]     = useState<Tab>("identidade");
  const [form,    setForm]    = useState<EmpresaConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/painel/config", { headers: authHeader() });
      const data = await res.json();
      if (data.success && data.data) {
        setForm(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(data.data).filter(([, v]) => v !== null && v !== undefined)
          ),
        }));
      }
    } catch {
      showToast("error", "Não foi possível carregar as configurações");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Toast ──────────────────────────────────────────────────────────────────

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const res  = await fetch("/api/painel/config", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Configurações salvas com sucesso!");
      } else {
        showToast("error", data.error ?? "Erro ao salvar configurações");
      }
    } catch {
      showToast("error", "Falha na conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  // ── Field helpers ──────────────────────────────────────────────────────────

  function set<K extends keyof EmpresaConfig>(key: K, value: EmpresaConfig[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
    { key: "identidade", label: "Identidade", Icon: Palette      },
    { key: "contato",    label: "Contato",    Icon: Phone        },
    { key: "pagamentos", label: "Pagamentos", Icon: CreditCard   },
    { key: "fidelidade", label: "Fidelidade", Icon: Award        },
    { key: "totem",      label: "Totem",      Icon: Monitor      },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="h-6 w-6 text-brand" />
            Configurações
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Personalize o visual, contato e funcionamento da sua empresa
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition"
        >
          {saving
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />
          }
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit flex-wrap">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === key
                ? "bg-brand/20 text-brand"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      )}

      {/* ── Tab: Identidade ── */}
      <AnimatePresence mode="wait">
        {!loading && tab === "identidade" && (
          <motion.div
            key="identidade"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="grid gap-5 lg:grid-cols-2"
          >
            {/* Left column */}
            <div className="space-y-5">
              {/* Basic info */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
                <h2 className="text-sm font-semibold text-white">Informações básicas</h2>

                <div>
                  <Label>Nome fantasia</Label>
                  <Input
                    value={form.nome_fantasia}
                    onChange={e => set("nome_fantasia", e.target.value)}
                    placeholder="Ex: Burguer House"
                  />
                </div>

                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    value={form.descricao}
                    onChange={e => set("descricao", e.target.value)}
                    rows={3}
                    placeholder="Breve descrição que aparece no cardápio público"
                  />
                </div>
              </div>

              {/* Images */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
                <h2 className="text-sm font-semibold text-white">Imagens</h2>
                <ImageField
                  label="Logo"
                  value={form.logo_url}
                  onChange={url => set("logo_url", url)}
                />
                <ImageField
                  label="Banner"
                  value={form.banner_url}
                  onChange={url => set("banner_url", url)}
                />
              </div>

              {/* Theme */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-sm font-semibold text-white mb-4">Tema do cardápio</h2>
                <div className="flex gap-3">
                  {(["dark", "light"] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set("tema", t)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition ${
                        form.tema === t
                          ? "border-brand/50 bg-brand/10 text-brand"
                          : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                      }`}
                    >
                      {t === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                      {t === "dark" ? "Escuro" : "Claro"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-5">
              {/* Colors */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
                <h2 className="text-sm font-semibold text-white">Cores</h2>
                <ColorField
                  label="Cor primária (destaques, botões)"
                  value={form.cor_primaria}
                  onChange={v => set("cor_primaria", v)}
                />
                <ColorField
                  label="Cor secundária (fundo, cards)"
                  value={form.cor_secundaria}
                  onChange={v => set("cor_secundaria", v)}
                />
              </div>

              {/* Preview */}
              <ColorPreview
                corPrimaria={form.cor_primaria}
                corSecundaria={form.cor_secundaria}
                nomFantasia={form.nome_fantasia}
              />
            </div>
          </motion.div>
        )}

        {/* ── Tab: Contato ── */}
        {!loading && tab === "contato" && (
          <motion.div
            key="contato"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="grid gap-5 lg:grid-cols-2"
          >
            {/* Contact info */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-white">Contato</h2>

              <div>
                <Label>WhatsApp</Label>
                <Input
                  value={form.whatsapp}
                  onChange={e => set("whatsapp", e.target.value)}
                  placeholder="(11) 99999-9999"
                  type="tel"
                />
              </div>

              <div>
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={e => set("telefone", e.target.value)}
                  placeholder="(11) 3333-3333"
                  type="tel"
                />
              </div>

              <div>
                <Label>E-mail</Label>
                <Input
                  value={form.email}
                  onChange={e => set("email", e.target.value)}
                  placeholder="contato@empresa.com.br"
                  type="email"
                />
              </div>
            </div>

            {/* Hours */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-white">Horários de funcionamento</h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Abertura</Label>
                  <Input
                    type="time"
                    value={form.horario_abertura}
                    onChange={e => set("horario_abertura", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Fechamento</Label>
                  <Input
                    type="time"
                    value={form.horario_fechamento}
                    onChange={e => set("horario_fechamento", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Dias de funcionamento</Label>
                <Input
                  value={form.dias_funcionamento}
                  onChange={e => set("dias_funcionamento", e.target.value)}
                  placeholder="Ex: Segunda a Sábado"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Texto livre que será exibido no cardápio público
                </p>
              </div>

              {/* Quick day buttons */}
              <div>
                <p className="text-xs text-slate-500 mb-2">Atalhos</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["Seg–Sex", "Segunda a Sexta"],
                    ["Seg–Sáb", "Segunda a Sábado"],
                    ["Todos os dias", "Todos os dias"],
                    ["Seg–Dom", "Segunda a Domingo"],
                  ].map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => set("dias_funcionamento", value)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Tab: Pagamentos ── */}
        {!loading && tab === "pagamentos" && (
          <motion.div
            key="pagamentos"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="grid gap-5 lg:grid-cols-2"
          >
            {/* Payment methods */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-white">Formas de pagamento aceitas</h2>

              {(
                [
                  ["aceita_dinheiro", "Dinheiro",  "Pagamento em espécie na entrega ou retirada"],
                  ["aceita_pix",      "PIX",        "Pagamento via PIX (chave ou QR code)"],
                  ["aceita_cartao",   "Cartão",     "Crédito ou débito via maquininha"],
                ] as [keyof EmpresaConfig, string, string][]
              ).map(([key, label, desc]) => (
                <div
                  key={key}
                  onClick={() => set(key, !form[key] as EmpresaConfig[typeof key])}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition ${
                    form[key]
                      ? "border-brand/30 bg-brand/5"
                      : "border-white/10 bg-white/5 opacity-60"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                  <Toggle
                    checked={form[key] as boolean}
                    onChange={v => set(key, v as EmpresaConfig[typeof key])}
                  />
                </div>
              ))}

              {/* Caixa obrigatório */}
              <div
                onClick={() => set("caixa_obrigatorio", !form.caixa_obrigatorio)}
                className={`mt-2 flex cursor-pointer items-center justify-between rounded-xl border p-4 transition ${
                  form.caixa_obrigatorio
                    ? "border-amber-400/30 bg-amber-500/5"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-white">Exigir caixa aberto</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Bloqueia pedidos no totem/balcão se nenhum caixa estiver aberto.
                    Delivery sempre é aceito.
                  </p>
                </div>
                <Toggle
                  checked={form.caixa_obrigatorio}
                  onChange={v => set("caixa_obrigatorio", v)}
                />
              </div>

              {/* Impressão automática na cozinha */}
              <div
                onClick={() => set("imprimir_cozinha_auto", !form.imprimir_cozinha_auto)}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition ${
                  form.imprimir_cozinha_auto
                    ? "border-brand/30 bg-brand/5"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-white">Imprimir cozinha automaticamente</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cada pedido novo abre popup de impressão no KDS sem clique. Permita popups no navegador.
                  </p>
                </div>
                <Toggle
                  checked={form.imprimir_cozinha_auto}
                  onChange={v => set("imprimir_cozinha_auto", v)}
                />
              </div>

              {/* Impressão automática do cupom do cliente */}
              <div
                onClick={() => set("imprimir_cupom_auto", !form.imprimir_cupom_auto)}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition ${
                  form.imprimir_cupom_auto
                    ? "border-brand/30 bg-brand/5"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-white">Imprimir cupom do cliente</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cada pedido novo dispara impressão do cupom não-fiscal no PC do PDV
                    (página /painel/pedidos aberta). Útil para entregar com o pedido.
                  </p>
                </div>
                <Toggle
                  checked={form.imprimir_cupom_auto}
                  onChange={v => set("imprimir_cupom_auto", v)}
                />
              </div>
            </div>

            {/* Delivery settings */}
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
                <h2 className="text-sm font-semibold text-white">Entrega e pedido mínimo</h2>

                <div>
                  <Label>Taxa de entrega (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.taxa_entrega}
                      onChange={e => set("taxa_entrega", Number(e.target.value))}
                      className="pl-10"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">Use 0 para entrega gratuita</p>
                </div>

                <div>
                  <Label>Pedido mínimo (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.pedido_minimo}
                      onChange={e => set("pedido_minimo", Number(e.target.value))}
                      className="pl-10"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">Use 0 para não exigir mínimo</p>
                </div>

                <div>
                  <Label>Tempo estimado de entrega (minutos)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={form.tempo_entrega_min}
                    onChange={e => set("tempo_entrega_min", Number(e.target.value))}
                    placeholder="Ex: 30"
                  />
                </div>
              </div>

              {/* Summary card */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
                <p className="text-xs font-medium text-slate-400">Resumo das configurações</p>
                <div className="divide-y divide-white/5">
                  {[
                    ["Dinheiro",  form.aceita_dinheiro ? "Aceito"    : "Não aceito"],
                    ["PIX",       form.aceita_pix      ? "Aceito"    : "Não aceito"],
                    ["Cartão",    form.aceita_cartao   ? "Aceito"    : "Não aceito"],
                    ["Entrega",   form.taxa_entrega > 0
                      ? `R$ ${Number(form.taxa_entrega).toFixed(2)}`
                      : "Grátis"],
                    ["Mín. pedido", form.pedido_minimo > 0
                      ? `R$ ${Number(form.pedido_minimo).toFixed(2)}`
                      : "Sem mínimo"],
                    ["Tempo de entrega", `${form.tempo_entrega_min} min`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-2">
                      <span className="text-xs text-slate-400">{k}</span>
                      <span className={`text-xs font-medium ${
                        String(v).startsWith("Não") ? "text-slate-500" : "text-white"
                      }`}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Tab: Fidelidade ── */}
        {!loading && tab === "fidelidade" && (
          <motion.div
            key="fidelidade"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="grid gap-5 lg:grid-cols-2"
          >
            {/* Toggle + settings */}
            <div className="space-y-5">
              {/* Master toggle */}
              <div
                onClick={() => set("fidelidade_ativo", !form.fidelidade_ativo)}
                className={`flex cursor-pointer items-center justify-between rounded-2xl border p-5 transition ${
                  form.fidelidade_ativo
                    ? "border-brand/30 bg-brand/5"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Award className={`h-8 w-8 flex-shrink-0 ${form.fidelidade_ativo ? "text-brand" : "text-slate-500"}`} />
                  <div>
                    <p className="font-semibold text-white">Programa de fidelidade</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Clientes acumulam pontos a cada compra e trocam por descontos
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={form.fidelidade_ativo}
                  onChange={v => set("fidelidade_ativo", v)}
                />
              </div>

              {/* Points config */}
              <div className={`rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4 transition ${
                !form.fidelidade_ativo ? "pointer-events-none opacity-40" : ""
              }`}>
                <h2 className="text-sm font-semibold text-white">Configuração dos pontos</h2>

                <div>
                  <Label>Pontos por R$ 1,00 gasto</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={form.pontos_por_real}
                    onChange={e => set("pontos_por_real", Number(e.target.value))}
                    placeholder="Ex: 1"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Quantos pontos o cliente ganha a cada R$ 1,00 comprado
                  </p>
                </div>

                <div>
                  <Label>Valor de R$ por ponto resgatado</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                    <Input
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={form.real_por_ponto}
                      onChange={e => set("real_por_ponto", Number(e.target.value))}
                      placeholder="Ex: 0.01"
                      className="pl-10"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Quanto cada ponto vale em reais no momento do resgate
                  </p>
                </div>
              </div>

              {/* Cashback */}
              <div
                onClick={() => set("cashback_ativo", !form.cashback_ativo)}
                className={`flex cursor-pointer items-center justify-between rounded-2xl border p-5 transition ${
                  form.cashback_ativo
                    ? "border-brand/30 bg-brand/5"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <DollarSign className={`h-8 w-8 flex-shrink-0 ${form.cashback_ativo ? "text-brand" : "text-slate-500"}`} />
                  <div>
                    <p className="font-semibold text-white">Cashback</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Cliente recebe % do valor pago como crédito em R$, usável no próximo pedido
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={form.cashback_ativo}
                  onChange={v => set("cashback_ativo", v)}
                />
              </div>

              <div className={`rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4 transition ${
                !form.cashback_ativo ? "pointer-events-none opacity-40" : ""
              }`}>
                <h2 className="text-sm font-semibold text-white">Configuração do cashback</h2>
                <div>
                  <Label>Percentual (%)</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={form.cashback_percentual}
                      onChange={e => set("cashback_percentual", Number(e.target.value))}
                      placeholder="Ex: 5"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Percentual do total da compra que vira saldo de cashback.
                    Exemplo: 5% sobre R$ 100 = R$ 5,00 de crédito.
                  </p>
                </div>
              </div>
            </div>

            {/* Info + examples */}
            <div className="space-y-5">
              {/* Example calculation */}
              <div className={`rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4 transition ${
                !form.fidelidade_ativo ? "opacity-40" : ""
              }`}>
                <p className="text-sm font-semibold text-white">Exemplo de funcionamento</p>

                {(() => {
                  const exemplo_compra = 50;
                  const pontos_ganhos = Math.floor(exemplo_compra * form.pontos_por_real);
                  const valor_desconto = (pontos_ganhos * form.real_por_ponto).toFixed(2);
                  return (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-white/5 p-4 space-y-2 text-sm">
                        <p className="text-slate-400">
                          Compra de{" "}
                          <span className="text-white font-medium">
                            R$ {exemplo_compra.toFixed(2)}
                          </span>
                        </p>
                        <div className="border-t border-white/10 pt-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Pontos ganhos</span>
                            <span className="text-brand font-medium">
                              +{pontos_ganhos} pts
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Valor em desconto</span>
                            <span className="text-brand font-medium">
                              R$ {valor_desconto}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Com {pontos_ganhos} pontos acumulados, o cliente pode obter um desconto de{" "}
                        <strong className="text-slate-300">R$ {valor_desconto}</strong> em um pedido futuro.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Tips */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm font-semibold text-white mb-3">Dicas</p>
                <ul className="space-y-2 text-xs text-slate-400 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="text-brand flex-shrink-0">•</span>
                    <span>Um valor comum é <strong className="text-slate-300">1 ponto por R$ 1,00</strong>, onde cada ponto vale <strong className="text-slate-300">R$ 0,01</strong> (1% de cashback).</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-brand flex-shrink-0">•</span>
                    <span>Para cashback de 2%, use <strong className="text-slate-300">1 ponto/real</strong> e <strong className="text-slate-300">R$ 0,02/ponto</strong>.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-brand flex-shrink-0">•</span>
                    <span>A fidelidade só funciona se o módulo estiver ativo no seu plano.</span>
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Tab: Totem ── */}
        {!loading && tab === "totem" && (
          <motion.div key="totem" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <Monitor className="h-5 w-5 text-amber-400" />
                <p className="font-semibold text-white">Personalização da tela inicial do Totem</p>
              </div>

              {/* CTA Text */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Texto do botão principal</label>
                <input
                  value={form.totem_cta_text}
                  onChange={e => setForm(f => ({ ...f, totem_cta_text: e.target.value }))}
                  placeholder="Toque para fazer seu pedido"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
                />
              </div>

              {/* Slogan */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Slogan / frase de destaque</label>
                <input
                  value={form.totem_slogan}
                  onChange={e => setForm(f => ({ ...f, totem_slogan: e.target.value }))}
                  placeholder="Ex: Sabores que atravessam séculos"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
                />
              </div>

              {/* Background video URL */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5" /> URL do vídeo de fundo (MP4 direto)
                </label>
                <input
                  value={form.totem_bg_video_url}
                  onChange={e => setForm(f => ({ ...f, totem_bg_video_url: e.target.value }))}
                  placeholder="https://exemplo.com/video.mp4"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">Use um link direto de arquivo .mp4. YouTube não é suportado (sem autoplay).</p>
              </div>

              {/* Background image URL */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" /> Imagem de fundo (fallback quando sem vídeo)
                </label>
                <input
                  value={form.totem_bg_image_url}
                  onChange={e => setForm(f => ({ ...f, totem_bg_image_url: e.target.value }))}
                  placeholder="https://exemplo.com/imagem.jpg"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
                />
              </div>

              {/* Preview link */}
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
                <p className="text-xs text-amber-300 font-medium mb-2">Pré-visualização</p>
                <p className="text-xs text-slate-400 mb-3">Acesse o totem pelo slug da empresa para ver o resultado. O vídeo/imagem e o texto do botão serão exibidos na tela inicial.</p>
                <button
                  type="button"
                  onClick={() => window.open(`/totem/${window.location.pathname.split('/')[1] || 'demo'}`, '_blank')}
                  className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir totem em nova aba
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Save button (bottom, duplicated for convenience) ── */}
      {!loading && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition"
          >
            {saving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />
            }
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
        </div>
      )}

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{   opacity: 0, y: 24,  scale: 0.95 }}
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur-sm ${
              toast.type === "success"
                ? "border-brand/30 bg-brand/10 text-brand"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {toast.type === "success"
              ? <CheckCircle className="h-5 w-5 flex-shrink-0 text-brand" />
              : <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
            }
            <span className="text-sm font-medium">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
