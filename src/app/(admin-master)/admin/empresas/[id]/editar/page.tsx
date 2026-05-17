"use client";

/**
 * /admin/empresas/[id]/editar
 *
 * Tela completa de edição da empresa (master only).
 * Seções: Identidade, Contato, Endereço, Gestor, Validação, Branding,
 *         Plano/Módulos, Slave.
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Building2, Phone, MapPin, User, ShieldCheck,
  Palette, Package, Plug, Loader2, Crown,
} from "lucide-react";
import { alertar } from "@/components/ui/ConfirmModal";
import { LiberarModuloModal } from "@/components/admin/LiberarModuloModal";

interface Empresa {
  id: string;
  nome_fantasia?: string; razao_social?: string; razao_social_full?: string;
  cnpj?: string; inscricao_estadual?: string; inscricao_municipal?: string;
  regime_tributario?: string;
  email?: string; whatsapp?: string; telefone?: string;
  endereco_cep?: string; endereco_logradouro?: string; endereco_numero?: string;
  endereco_complemento?: string; endereco_bairro?: string; endereco_cidade?: string; endereco_uf?: string;
  gestor_nome?: string; gestor_cpf?: string; gestor_rg?: string;
  gestor_telefone?: string; gestor_email?: string;
  cadastro_status?: "pendente" | "em_analise" | "aprovado" | "rejeitado";
  cadastro_motivo_rejeicao?: string;
  exibir_como_parceiro?: boolean;
  cor_primaria?: string; cor_secundaria?: string;
  logo_url?: string; banner_url?: string;
  status?: string; plano_id?: string | null;
  modulos_ativos?: string[];
  slave_key?: string; slave_ativo?: boolean;
  assinatura_expira_em?: string | null;
  plano_nome?: string;
}

interface Plano { id: string; nome: string; modulos: string[]; modulos_alacarte?: { id: string; preco: number }[] }
interface Extra { modulo: string; tipo: string }

const MODULOS_DISPONIVEIS = [
  "balcao","mesa","delivery","kiosk","totem","ifood","whatsapp",
  "comandas","caixa","cozinha","tv","relatorios","estoque","cupons",
];

const REGIMES = ["", "mei", "simples", "lucro_presumido", "lucro_real"];

export default function EditarEmpresaPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [emp, setEmp]   = useState<Empresa | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [moduloPraLiberar, setModuloPraLiberar] = useState<string | null>(null);
  const [tab, setTab] = useState<
    "identidade" | "contato" | "endereco" | "gestor" | "validacao" | "plano" | "branding" | "slave"
  >("identidade");

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    const [e, p, ex] = await Promise.all([
      fetch(`/api/admin/empresas/${id}`,                  { headers: auth() }).then(r => r.json()),
      fetch(`/api/admin/planos`,                          { headers: auth() }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`/api/admin/empresas/${id}/modulos-extras`,   { headers: auth() }).then(r => r.json()).catch(() => ({ data: [] })),
    ]);
    if (e.success)  setEmp(e.data);
    if (p.success)  setPlanos(Array.isArray(p.data) ? p.data : (p.data?.planos ?? []));
    if (ex.success) setExtras(ex.data ?? []);
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  function set<K extends keyof Empresa>(k: K, v: Empresa[K]) {
    setEmp(prev => prev ? { ...prev, [k]: v } : prev);
    setDirty(true);
  }

  async function salvar() {
    if (!emp) return;
    setBusy(true);
    try {
      // Mando só campos que não são derivados/readonly
      const { id: _id, created_at: _c, updated_at: _u, plano_nome: _p,
              cadastro_aprovado_por: _ap, cadastro_aprovado_em: _ae,
              slave_ultimo_sync: _ss, ...payload } = emp as Empresa & Record<string, unknown>;
      void _id; void _c; void _u; void _p; void _ap; void _ae; void _ss;
      const r = await fetch(`/api/admin/empresas/${id}`, {
        method: "PATCH", headers: auth(), body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha ao salvar");
      setDirty(false);
      await alertar({ titulo: "Salvo", tipo: "sucesso" });
      carregar();
    } catch (err) {
      await alertar({ titulo: "Falha", mensagem: (err as Error).message, tipo: "perigo" });
    } finally { setBusy(false); }
  }

  async function buscarCep() {
    if (!emp?.endereco_cep) return;
    const cep = emp.endereco_cep.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) return;
      setEmp(prev => prev ? {
        ...prev,
        endereco_logradouro: d.logradouro ?? prev.endereco_logradouro,
        endereco_bairro:     d.bairro     ?? prev.endereco_bairro,
        endereco_cidade:     d.localidade ?? prev.endereco_cidade,
        endereco_uf:         d.uf         ?? prev.endereco_uf,
      } : prev);
      setDirty(true);
    } catch {}
  }

  function toggleModulo(m: string) {
    if (!emp) return;
    const planoAtual = planos.find(p => p.id === emp.plano_id);
    const noPlano    = (planoAtual?.modulos ?? []).includes(m);
    const lista      = emp.modulos_ativos ?? [];

    // Se já está nos ativos → só desativa
    if (lista.includes(m)) {
      set("modulos_ativos", lista.filter(x => x !== m));
      return;
    }

    // Se está no plano → ativa direto
    if (noPlano) {
      set("modulos_ativos", [...lista, m]);
      return;
    }

    // Não está no plano → abre modal pra escolher tipo de liberação
    setModuloPraLiberar(m);
  }

  function precoSugeridoDoModulo(m: string): number | undefined {
    const planoAtual = planos.find(p => p.id === emp?.plano_id);
    const alacarte   = planoAtual?.modulos_alacarte ?? [];
    const item       = alacarte.find(x => x.id === m);
    return item?.preco;
  }

  if (!emp) return <div className="p-8 text-slate-400">Carregando...</div>;

  const TABS = [
    { id: "identidade", label: "Identidade",  icon: Building2 },
    { id: "contato",    label: "Contato",     icon: Phone },
    { id: "endereco",   label: "Endereço",    icon: MapPin },
    { id: "gestor",     label: "Gestor",      icon: User },
    { id: "validacao",  label: "Validação",   icon: ShieldCheck },
    { id: "plano",      label: "Plano/Mód.",  icon: Package },
    { id: "branding",   label: "Branding",    icon: Palette },
    { id: "slave",      label: "Slave",       icon: Plug },
  ] as const;

  return (
    <div className="space-y-6 pb-12 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/admin/empresas/${id}`)}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Editar — {emp.nome_fantasia}</h1>
            <p className="text-xs text-slate-400">
              Status: <span className="font-mono text-emerald-400">{emp.status}</span>
              {emp.cadastro_status && (
                <> · Cadastro: <span className={`font-mono ${
                  emp.cadastro_status === "aprovado"  ? "text-emerald-400" :
                  emp.cadastro_status === "rejeitado" ? "text-red-400"     :
                  emp.cadastro_status === "em_analise" ? "text-blue-400"   :
                  "text-amber-400"
                }`}>{emp.cadastro_status}</span></>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={salvar}
          disabled={!dirty || busy}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar alterações
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
                active ? "bg-emerald-500/15 text-emerald-300"
                       : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        {tab === "identidade" && (
          <Grid>
            <Field label="Nome fantasia">
              <Input value={emp.nome_fantasia ?? ""} onChange={v => set("nome_fantasia", v)} />
            </Field>
            <Field label="Razão social">
              <Input value={emp.razao_social ?? ""} onChange={v => set("razao_social", v)} />
            </Field>
            <Field label="Razão social completa">
              <Input value={emp.razao_social_full ?? ""} onChange={v => set("razao_social_full", v)} />
            </Field>
            <Field label="CNPJ">
              <Input value={emp.cnpj ?? ""} onChange={v => set("cnpj", v)} placeholder="00.000.000/0000-00" />
            </Field>
            <Field label="Inscrição Estadual">
              <Input value={emp.inscricao_estadual ?? ""} onChange={v => set("inscricao_estadual", v)} />
            </Field>
            <Field label="Inscrição Municipal">
              <Input value={emp.inscricao_municipal ?? ""} onChange={v => set("inscricao_municipal", v)} />
            </Field>
            <Field label="Regime tributário">
              <select
                value={emp.regime_tributario ?? ""}
                onChange={e => set("regime_tributario", e.target.value || undefined)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                {REGIMES.map(r => (
                  <option key={r} value={r}>{r ? r.replace(/_/g, " ").toUpperCase() : "—"}</option>
                ))}
              </select>
            </Field>
          </Grid>
        )}

        {tab === "contato" && (
          <Grid>
            <Field label="Email principal">
              <Input value={emp.email ?? ""} onChange={v => set("email", v)} type="email" />
            </Field>
            <Field label="WhatsApp">
              <Input value={emp.whatsapp ?? ""} onChange={v => set("whatsapp", v)} placeholder="(11) 99999-9999" />
            </Field>
            <Field label="Telefone">
              <Input value={emp.telefone ?? ""} onChange={v => set("telefone", v)} />
            </Field>
          </Grid>
        )}

        {tab === "endereco" && (
          <Grid>
            <Field label="CEP">
              <div className="flex gap-2">
                <Input
                  value={emp.endereco_cep ?? ""}
                  onChange={v => set("endereco_cep", v)}
                  onBlur={buscarCep}
                  placeholder="00000-000"
                />
                <button
                  onClick={buscarCep}
                  type="button"
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20"
                >
                  Buscar
                </button>
              </div>
            </Field>
            <Field label="Logradouro">
              <Input value={emp.endereco_logradouro ?? ""} onChange={v => set("endereco_logradouro", v)} />
            </Field>
            <Field label="Número">
              <Input value={emp.endereco_numero ?? ""} onChange={v => set("endereco_numero", v)} />
            </Field>
            <Field label="Complemento">
              <Input value={emp.endereco_complemento ?? ""} onChange={v => set("endereco_complemento", v)} />
            </Field>
            <Field label="Bairro">
              <Input value={emp.endereco_bairro ?? ""} onChange={v => set("endereco_bairro", v)} />
            </Field>
            <Field label="Cidade">
              <Input value={emp.endereco_cidade ?? ""} onChange={v => set("endereco_cidade", v)} />
            </Field>
            <Field label="UF">
              <Input value={emp.endereco_uf ?? ""} onChange={v => set("endereco_uf", v.toUpperCase().slice(0,2))} placeholder="SP" />
            </Field>
          </Grid>
        )}

        {tab === "gestor" && (
          <Grid>
            <Field label="Nome do gestor / responsável legal">
              <Input value={emp.gestor_nome ?? ""} onChange={v => set("gestor_nome", v)} />
            </Field>
            <Field label="CPF do gestor">
              <Input value={emp.gestor_cpf ?? ""} onChange={v => set("gestor_cpf", v)} placeholder="000.000.000-00" />
            </Field>
            <Field label="RG do gestor">
              <Input value={emp.gestor_rg ?? ""} onChange={v => set("gestor_rg", v)} />
            </Field>
            <Field label="Telefone do gestor">
              <Input value={emp.gestor_telefone ?? ""} onChange={v => set("gestor_telefone", v)} />
            </Field>
            <Field label="Email do gestor">
              <Input type="email" value={emp.gestor_email ?? ""} onChange={v => set("gestor_email", v)} />
            </Field>
          </Grid>
        )}

        {tab === "validacao" && (
          <div className="space-y-4">
            <Field label="Status cadastral">
              <select
                value={emp.cadastro_status ?? "pendente"}
                onChange={e => set("cadastro_status", e.target.value as Empresa["cadastro_status"])}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="pendente">Pendente</option>
                <option value="em_analise">Em análise</option>
                <option value="aprovado">Aprovado</option>
                <option value="rejeitado">Rejeitado</option>
              </select>
            </Field>
            {emp.cadastro_status === "rejeitado" && (
              <Field label="Motivo da rejeição">
                <textarea
                  value={emp.cadastro_motivo_rejeicao ?? ""}
                  onChange={e => set("cadastro_motivo_rejeicao", e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={emp.exibir_como_parceiro ?? false}
                onChange={e => set("exibir_como_parceiro", e.target.checked)}
                className="rounded border-white/20 bg-white/5"
              />
              Exibir como parceiro no site institucional (se tiver logo)
            </label>
            <a
              href={`/admin/empresas/${id}/documentos`}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-300 hover:bg-blue-500/20"
            >
              📎 Ver documentos anexados
            </a>
          </div>
        )}

        {tab === "plano" && (
          <div className="space-y-4">
            <Field label="Plano">
              <select
                value={emp.plano_id ?? ""}
                onChange={e => {
                  const pid = e.target.value || null;
                  set("plano_id", pid);
                  const pl = planos.find(p => p.id === pid);
                  if (pl?.modulos) set("modulos_ativos", pl.modulos);
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="">— sem plano —</option>
                {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Mudar plano substitui módulos ativos. Pra liberar extra: tela de Módulos.
              </p>
            </Field>
            <Field label="Status da empresa">
              <select
                value={emp.status ?? "ativo"}
                onChange={e => set("status", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="ativo">Ativo</option>
                <option value="teste">Teste</option>
                <option value="inativo">Inativo</option>
                <option value="suspenso">Suspenso</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            </Field>
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Módulos ativos</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {MODULOS_DISPONIVEIS.map(m => {
                  const ativo  = (emp.modulos_ativos ?? []).includes(m);
                  const extra  = extras.find(x => x.modulo === m);
                  const planoAtual = planos.find(p => p.id === emp.plano_id);
                  const noPlano = (planoAtual?.modulos ?? []).includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleModulo(m)}
                      className={`flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        ativo ? (noPlano
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : "border-amber-500/40 bg-amber-500/15 text-amber-300")
                              : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                      }`}
                      title={
                        extra ? `Extra: ${extra.tipo}` :
                        noPlano ? "Incluído no plano" :
                        "Clique pra liberar como extra"
                      }
                    >
                      {extra && <Crown className="h-3 w-3 text-amber-400" />}
                      {m}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Verde = do plano · Amarelo+👑 = extra liberado · Clique num cinza pra ofertar como extra
              </p>
              <a
                href={`/admin/empresas/${id}/modulos-extras`}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/20"
              >
                👑 Gerenciar módulos extras (experimental / à la carte / grátis)
              </a>
            </div>
          </div>
        )}

        {tab === "branding" && (
          <Grid>
            <Field label="Cor primária">
              <Input value={emp.cor_primaria ?? ""} onChange={v => set("cor_primaria", v)} placeholder="#10b981" />
            </Field>
            <Field label="Cor secundária">
              <Input value={emp.cor_secundaria ?? ""} onChange={v => set("cor_secundaria", v)} placeholder="#3b82f6" />
            </Field>
            <Field label="Logo URL">
              <Input value={emp.logo_url ?? ""} onChange={v => set("logo_url", v)} />
            </Field>
            <Field label="Banner URL">
              <Input value={emp.banner_url ?? ""} onChange={v => set("banner_url", v)} />
            </Field>
          </Grid>
        )}

        {moduloPraLiberar && (
          <LiberarModuloModal
            empresaId={id}
            modulo={moduloPraLiberar}
            precoSugerido={precoSugeridoDoModulo(moduloPraLiberar)}
            onClose={() => setModuloPraLiberar(null)}
            onSuccess={() => { carregar(); }}
          />
        )}

        {tab === "slave" && (
          <Grid>
            <Field label="Slave key">
              <Input value={emp.slave_key ?? ""} onChange={v => set("slave_key", v)} />
            </Field>
            <Field label="Slave ativo">
              <select
                value={String(emp.slave_ativo ?? false)}
                onChange={e => set("slave_ativo", e.target.value === "true")}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="false">Não</option>
                <option value="true">Sim</option>
              </select>
            </Field>
          </Grid>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({
  value, onChange, type = "text", placeholder, onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  onBlur?: () => void;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
    />
  );
}
