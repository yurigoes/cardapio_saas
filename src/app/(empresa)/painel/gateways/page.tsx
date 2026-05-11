"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CreditCard, Banknote, QrCode, BadgeCheck,
  ChevronDown, Info, Save, Loader2, AlertCircle, CheckCircle2,
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
        focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500
        ${checked ? "bg-emerald-500" : "bg-white/10"}
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

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, gwRes] = await Promise.all([
        fetch("/api/painel/config",   { headers: authHeader() }),
        fetch("/api/painel/gateways", { headers: authHeader() }),
      ]);

      if (cfgRes.ok) {
        const { data } = await cfgRes.json() as { data: EmpresaConfig };
        setAceitaDinheiro(Boolean(data.aceita_dinheiro));
        setAceitaPix(Boolean(data.aceita_pix));
        setAceitaCartao(Boolean(data.aceita_cartao));
        // Show PIX section open if already enabled
        if (data.aceita_pix) setPixOpen(true);
      }

      if (gwRes.ok) {
        const { data } = await gwRes.json() as { data: GatewayConfig };
        if (data.pix_tipo)       setPixTipo(data.pix_tipo);
        if (data.pix_chave)      setPixChave(data.pix_chave);
        if (data.pix_favorecido) setPixFavorecido(data.pix_favorecido);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
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
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
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
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Banknote className="h-5 w-5 text-emerald-400" />
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
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
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
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
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
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
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

      {/* ── Gateways Online ── */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Gateways Online
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Mercado Pago */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5">
            {/* colored top strip */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#009ee3] to-[#00cfc8]" />

            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#009ee3]/15">
                  {/* MP logo placeholder */}
                  <span className="text-lg font-black text-[#009ee3] leading-none">MP</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Mercado Pago</p>
                  <p className="text-xs text-slate-500">Cartão, PIX e boleto online</p>
                </div>
              </div>
              <span className="rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
                Em desenvolvimento
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  Public Key
                </label>
                <input
                  disabled
                  placeholder="TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full rounded-xl border border-white/5 bg-white/3 px-3 py-2.5 text-sm text-slate-600 placeholder-slate-600 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  Access Token
                </label>
                <input
                  disabled
                  type="password"
                  placeholder="TEST-0000000000000000-000000-xxxxxxxx"
                  className="w-full rounded-xl border border-white/5 bg-white/3 px-3 py-2.5 text-sm text-slate-600 placeholder-slate-600 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-600">
              <BadgeCheck className="h-3.5 w-3.5" />
              Disponível em breve — aguarde atualizações
            </div>
          </div>

          {/* PagSeguro */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#00b272] to-[#00d4ff]" />

            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00b272]/15">
                  <span className="text-xs font-black text-[#00b272] leading-none tracking-tighter">PS</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">PagSeguro</p>
                  <p className="text-xs text-slate-500">Cartão, PIX e boleto online</p>
                </div>
              </div>
              <span className="rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
                Em desenvolvimento
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  Token de integração
                </label>
                <input
                  disabled
                  type="password"
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded-xl border border-white/5 bg-white/3 px-3 py-2.5 text-sm text-slate-600 placeholder-slate-600 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  E-mail da conta PagSeguro
                </label>
                <input
                  disabled
                  placeholder="conta@pagseguro.com.br"
                  className="w-full rounded-xl border border-white/5 bg-white/3 px-3 py-2.5 text-sm text-slate-600 placeholder-slate-600 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-600">
              <BadgeCheck className="h-3.5 w-3.5" />
              Disponível em breve — aguarde atualizações
            </div>
          </div>
        </div>
      </section>

      {/* ── Save button ── */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-400 disabled:opacity-50 transition"
        >
          {saving
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save     className="h-4 w-4" />
          }
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </div>
  );
}
