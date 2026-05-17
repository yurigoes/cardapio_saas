"use client";

/**
 * /painel/empresa/cadastro
 * Cliente completa dados cadastrais (endereço + CNPJ + gestor),
 * faz upload de documentos (CNPJ, identidade, selfie) e acessa contrato.
 *
 * Status visível: pendente → em_analise (após upload) → aprovado/rejeitado pelo master.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Building2, MapPin, User, FileText, Upload, Check, Trash2,
  Loader2, AlertTriangle, FileSignature, ArrowRight,
} from "lucide-react";
import { alertar, confirmar } from "@/components/ui/ConfirmModal";

interface EmpresaConfig {
  nome_fantasia?: string;
  razao_social_full?: string; cnpj?: string;
  inscricao_estadual?: string; inscricao_municipal?: string; regime_tributario?: string;
  endereco_cep?: string; endereco_logradouro?: string; endereco_numero?: string;
  endereco_complemento?: string; endereco_bairro?: string; endereco_cidade?: string; endereco_uf?: string;
  gestor_nome?: string; gestor_cpf?: string; gestor_rg?: string;
  gestor_telefone?: string; gestor_email?: string;
  cadastro_status?: string; cadastro_motivo_rejeicao?: string;
}

interface Doc {
  id: string; tipo: string; nome_arquivo: string; url: string;
  status?: "pendente" | "aprovado" | "rejeitado";
  validado: boolean; observacao: string | null; created_at: string;
}

const TIPOS_DOC = [
  { id: "cnpj",                 label: "CNPJ / Cartão CNPJ", obrigatorio: true },
  { id: "identidade_frente",    label: "Identidade do gestor (frente)", obrigatorio: true },
  { id: "identidade_verso",     label: "Identidade do gestor (verso)", obrigatorio: true },
  { id: "selfie_com_documento", label: "Selfie segurando a identidade", obrigatorio: true },
  { id: "contrato_social",      label: "Contrato social (opcional)", obrigatorio: false },
  { id: "comprovante_endereco", label: "Comprovante de endereço (opcional)", obrigatorio: false },
];

export default function CadastroEmpresaPage() {
  const [emp, setEmp] = useState<EmpresaConfig | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    const [c, d] = await Promise.all([
      fetch("/api/painel/config",            { headers: auth() }).then(r => r.json()),
      fetch("/api/painel/empresa/documentos",{ headers: auth() }).then(r => r.json()),
    ]);
    if (c.success) setEmp(c.data);
    if (d.success) setDocs(d.data ?? []);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function set<K extends keyof EmpresaConfig>(k: K, v: EmpresaConfig[K]) {
    setEmp(prev => prev ? { ...prev, [k]: v } : prev);
  }

  async function salvarDados() {
    if (!emp) return;
    setSalvandoDados(true);
    try {
      const r = await fetch("/api/painel/config", {
        method: "PATCH", headers: auth(),
        body: JSON.stringify(emp),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha");
      await alertar({ titulo: "Dados salvos", tipo: "sucesso" });
      carregar();
    } catch (e) {
      await alertar({ titulo: "Falha", mensagem: (e as Error).message, tipo: "perigo" });
    } finally { setSalvandoDados(false); }
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
    } catch {}
  }

  function clickUpload(tipo: string) {
    setUploadingTipo(tipo);
    fileRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadingTipo) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipo", uploadingTipo);
      const r = await fetch("/api/painel/empresa/documentos", {
        method: "POST",
        headers: { Authorization: auth().Authorization },
        body: fd,
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Upload falhou");
      carregar();
    } catch (err) {
      await alertar({ titulo: "Falha upload", mensagem: (err as Error).message, tipo: "perigo" });
    } finally { setBusy(false); setUploadingTipo(null); }
  }

  async function removerDoc(d: Doc) {
    if (!await confirmar({ titulo: `Remover "${d.nome_arquivo}"?`, perigo: true })) return;
    await fetch(`/api/painel/empresa/documentos/${d.id}`, {
      method: "DELETE", headers: auth(),
    });
    carregar();
  }

  if (!emp) return <div className="p-8 text-slate-400">Carregando...</div>;

  const docsPorTipo = new Map(docs.map(d => [d.tipo, d]));
  const docsObrigatoriosFaltando = TIPOS_DOC.filter(t => t.obrigatorio && !docsPorTipo.has(t.id));

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <input type="file" accept="image/*,application/pdf" ref={fileRef} className="hidden" onChange={onFileSelected} />

      <div>
        <h1 className="text-2xl font-bold text-white">Cadastro da empresa</h1>
        <p className="mt-1 text-sm text-slate-400">
          Complete os dados cadastrais e envie os documentos para validação.
        </p>
      </div>

      {/* Status banner */}
      {emp.cadastro_status && (
        <div className={`rounded-xl border p-4 ${
          emp.cadastro_status === "aprovado"   ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" :
          emp.cadastro_status === "rejeitado"  ? "border-red-500/30 bg-red-500/10 text-red-200" :
          emp.cadastro_status === "em_analise" ? "border-blue-500/30 bg-blue-500/10 text-blue-200" :
                                                  "border-amber-500/30 bg-amber-500/10 text-amber-200"
        }`}>
          <p className="font-bold uppercase text-xs tracking-wider">
            Status: {emp.cadastro_status.replace("_", " ")}
          </p>
          {emp.cadastro_status === "rejeitado" && emp.cadastro_motivo_rejeicao && (
            <p className="mt-1 text-sm">Motivo: {emp.cadastro_motivo_rejeicao}</p>
          )}
          {emp.cadastro_status === "em_analise" && (
            <p className="mt-1 text-sm">Sua documentação está em revisão pelo nosso suporte.</p>
          )}
        </div>
      )}

      {/* Dados básicos */}
      <Section title="Identidade da empresa" icon={Building2}>
        <Grid>
          <Field label="Nome fantasia"><Input value={emp.nome_fantasia ?? ""} onChange={v => set("nome_fantasia", v)} /></Field>
          <Field label="Razão social"><Input value={emp.razao_social_full ?? ""} onChange={v => set("razao_social_full", v)} /></Field>
          <Field label="CNPJ"><Input value={emp.cnpj ?? ""} onChange={v => set("cnpj", v)} placeholder="00.000.000/0000-00" /></Field>
          <Field label="Inscrição Estadual"><Input value={emp.inscricao_estadual ?? ""} onChange={v => set("inscricao_estadual", v)} /></Field>
          <Field label="Inscrição Municipal"><Input value={emp.inscricao_municipal ?? ""} onChange={v => set("inscricao_municipal", v)} /></Field>
          <Field label="Regime tributário">
            <select value={emp.regime_tributario ?? ""}
              onChange={e => set("regime_tributario", e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
              <option value="">—</option>
              <option value="mei">MEI</option>
              <option value="simples">Simples Nacional</option>
              <option value="lucro_presumido">Lucro Presumido</option>
              <option value="lucro_real">Lucro Real</option>
            </select>
          </Field>
        </Grid>
      </Section>

      <Section title="Endereço" icon={MapPin}>
        <Grid>
          <Field label="CEP">
            <div className="flex gap-2">
              <Input value={emp.endereco_cep ?? ""} onChange={v => set("endereco_cep", v)} onBlur={buscarCep} placeholder="00000-000" />
              <button onClick={buscarCep} type="button"
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20">
                Buscar
              </button>
            </div>
          </Field>
          <Field label="Logradouro"><Input value={emp.endereco_logradouro ?? ""} onChange={v => set("endereco_logradouro", v)} /></Field>
          <Field label="Número"><Input value={emp.endereco_numero ?? ""} onChange={v => set("endereco_numero", v)} /></Field>
          <Field label="Complemento"><Input value={emp.endereco_complemento ?? ""} onChange={v => set("endereco_complemento", v)} /></Field>
          <Field label="Bairro"><Input value={emp.endereco_bairro ?? ""} onChange={v => set("endereco_bairro", v)} /></Field>
          <Field label="Cidade"><Input value={emp.endereco_cidade ?? ""} onChange={v => set("endereco_cidade", v)} /></Field>
          <Field label="UF"><Input value={emp.endereco_uf ?? ""} onChange={v => set("endereco_uf", v.toUpperCase().slice(0,2))} /></Field>
        </Grid>
      </Section>

      <Section title="Responsável legal (gestor)" icon={User}>
        <Grid>
          <Field label="Nome completo"><Input value={emp.gestor_nome ?? ""} onChange={v => set("gestor_nome", v)} /></Field>
          <Field label="CPF"><Input value={emp.gestor_cpf ?? ""} onChange={v => set("gestor_cpf", v)} placeholder="000.000.000-00" /></Field>
          <Field label="RG"><Input value={emp.gestor_rg ?? ""} onChange={v => set("gestor_rg", v)} /></Field>
          <Field label="Telefone"><Input value={emp.gestor_telefone ?? ""} onChange={v => set("gestor_telefone", v)} /></Field>
          <Field label="Email"><Input type="email" value={emp.gestor_email ?? ""} onChange={v => set("gestor_email", v)} /></Field>
        </Grid>
      </Section>

      <button onClick={salvarDados} disabled={salvandoDados}
        className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
        {salvandoDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Salvar dados cadastrais
      </button>

      {/* Documentos */}
      <Section title="Documentos" icon={FileText}>
        {docsObrigatoriosFaltando.length > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">
              Faltam: <strong>{docsObrigatoriosFaltando.map(d => d.label).join(", ")}</strong>
            </p>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {TIPOS_DOC.map(t => {
            const enviado = docsPorTipo.get(t.id);
            const st = enviado?.status ?? (enviado?.validado ? "aprovado" : "pendente");
            return (
              <div key={t.id} className={`rounded-xl border p-3 ${
                st === "aprovado"   ? "border-emerald-500/30 bg-emerald-500/5" :
                st === "rejeitado"  ? "border-red-500/40 bg-red-500/10" :
                enviado             ? "border-blue-500/20 bg-blue-500/5" :
                t.obrigatorio       ? "border-amber-500/20 bg-amber-500/5" :
                                       "border-white/10 bg-white/5"
              }`}>
                <p className="text-sm font-medium text-white">
                  {t.label}
                  {t.obrigatorio && <span className="ml-1 text-red-400">*</span>}
                </p>
                {enviado ? (
                  <>
                    <p className="mt-1 text-xs text-slate-400 truncate">{enviado.nome_arquivo}</p>
                    {st === "aprovado" && (
                      <span className="mt-1 inline-block rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        ✓ APROVADO
                      </span>
                    )}
                    {st === "rejeitado" && (
                      <span className="mt-1 inline-block rounded bg-red-500/30 px-2 py-0.5 text-[10px] font-bold text-red-200">
                        ✗ REJEITADO — REENVIE
                      </span>
                    )}
                    {st === "pendente" && (
                      <span className="mt-1 inline-block rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        ⏳ EM ANÁLISE
                      </span>
                    )}
                    {enviado.observacao && st === "rejeitado" && (
                      <p className="mt-1 rounded bg-red-500/20 px-2 py-1 text-xs text-red-200">
                        💬 Motivo: {enviado.observacao}
                      </p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <a href={enviado.url} target="_blank" rel="noopener"
                        className="text-xs text-emerald-300 hover:underline">Ver</a>
                      {st !== "aprovado" && (
                        <button onClick={async () => {
                          await removerDoc(enviado);
                          if (st === "rejeitado") clickUpload(t.id);
                        }}
                          className="text-xs text-red-300 hover:underline flex items-center gap-1">
                          <Trash2 className="h-3 w-3" />
                          {st === "rejeitado" ? "Reenviar" : "Remover"}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <button onClick={() => clickUpload(t.id)} disabled={busy}
                    className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40">
                    <Upload className="h-3.5 w-3.5" />
                    {busy && uploadingTipo === t.id ? "Enviando..." : "Enviar"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Contrato */}
      <Section title="Contrato de prestação de serviços" icon={FileSignature}>
        <p className="mb-3 text-sm text-slate-400">
          Leia e aceite o contrato eletronicamente para finalizar seu cadastro.
        </p>
        <a href="/painel/empresa/contrato"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400">
          Ver contrato <ArrowRight className="h-4 w-4" />
        </a>
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300">
        <Icon className="h-4 w-4" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder, onBlur }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string; onBlur?: () => void;
}) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)} onBlur={onBlur}
      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none" />
  );
}
