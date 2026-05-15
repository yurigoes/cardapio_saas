"use client";

/**
 * /admin/suporte/configuracoes — Master configura suporte
 *
 * Tabs:
 * - Horários de atendimento + mensagem fora-do-horário
 * - Templates de email (resposta cliente, chamado novo pra equipe)
 * - Templates de WhatsApp (resposta, validação admin/usuário)
 */
import { useEffect, useState } from "react";
import { Settings, Clock, Mail, MessageCircle, Save, Loader2, Check } from "lucide-react";

interface Horario { dia: string; inicio: string; fim: string; }

interface Config {
  ativo: boolean;
  fuso: string;
  horarios: Horario[];
  mensagem_offline: string;
  email_chamado: string | null;
  email_subject_resposta:    string;
  email_html_resposta:       string;
  email_subject_chamado_novo: string;
  email_html_chamado_novo:    string;
  whatsapp_resposta_cliente: string;
  whatsapp_validacao_admin:  string;
  whatsapp_validacao_usuario: string;
}

const DIAS = [
  { v: "dom", lbl: "Domingo" }, { v: "seg", lbl: "Segunda" }, { v: "ter", lbl: "Terça" },
  { v: "qua", lbl: "Quarta" },  { v: "qui", lbl: "Quinta" },  { v: "sex", lbl: "Sexta" }, { v: "sab", lbl: "Sábado" },
];

function authH(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function ConfiguracoesSuportePage() {
  const [tab, setTab] = useState<"horarios" | "email" | "whatsapp">("horarios");
  const [cfg, setCfg]   = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  async function carregar() {
    try {
      const r = await fetch("/api/painel/suporte/horarios", { headers: authH(), cache: "no-store" });
      const d = await r.json();
      if (d.success) setCfg(d.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function salvar() {
    if (!cfg) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/painel/suporte/horarios", {
        method:  "PUT",
        headers: { ...authH(), "Content-Type": "application/json" },
        body:    JSON.stringify(cfg),
      });
      if (r.ok) { setSalvo(true); setTimeout(() => setSalvo(false), 3000); }
    } finally { setSalvando(false); }
  }

  function alterarHorario(idx: number, campo: keyof Horario, val: string) {
    if (!cfg) return;
    const h = [...cfg.horarios];
    h[idx] = { ...h[idx], [campo]: val };
    setCfg({ ...cfg, horarios: h });
  }

  function toggleDia(dia: string) {
    if (!cfg) return;
    const existe = cfg.horarios.find(h => h.dia === dia);
    if (existe) {
      setCfg({ ...cfg, horarios: cfg.horarios.filter(h => h.dia !== dia) });
    } else {
      setCfg({ ...cfg, horarios: [...cfg.horarios, { dia, inicio: "09:00", fim: "18:00" }] });
    }
  }

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-400"/></div>;
  if (!cfg) return <div>Erro ao carregar config</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Settings className="h-5 w-5 text-emerald-400" /> Configurações de Suporte
          </h1>
          <p className="text-sm text-slate-400">Horários, templates de email e WhatsApp</p>
        </div>
        <button onClick={salvar} disabled={salvando}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> :
           salvo    ? <Check className="h-4 w-4" /> :
                      <Save className="h-4 w-4" />}
          {salvando ? "Salvando..." : salvo ? "Salvo!" : "Salvar"}
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {[
          { v: "horarios" as const, lbl: "Horários", icon: Clock },
          { v: "email"    as const, lbl: "Email",    icon: Mail },
          { v: "whatsapp" as const, lbl: "WhatsApp", icon: MessageCircle },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.v} onClick={() => setTab(t.v)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition ${
                tab === t.v
                  ? "border-emerald-400 text-emerald-300"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}>
              <Icon className="h-4 w-4" /> {t.lbl}
            </button>
          );
        })}
      </div>

      {/* Tab: HORÁRIOS */}
      {tab === "horarios" && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={cfg.ativo}
              onChange={e => setCfg({ ...cfg, ativo: e.target.checked })}
              className="h-4 w-4 accent-emerald-500" />
            <span className="text-sm text-white">Suporte ativo</span>
          </label>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Fuso horário</label>
            <input value={cfg.fuso} onChange={e => setCfg({ ...cfg, fuso: e.target.value })}
              placeholder="America/Sao_Paulo"
              className="w-full max-w-xs rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">Dias e horários</p>
            <div className="space-y-2">
              {DIAS.map(d => {
                const cfgDia = cfg.horarios.find(h => h.dia === d.v);
                const idx = cfg.horarios.findIndex(h => h.dia === d.v);
                return (
                  <div key={d.v} className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900 px-3 py-2">
                    <label className="flex items-center gap-2 cursor-pointer w-32">
                      <input type="checkbox" checked={!!cfgDia}
                        onChange={() => toggleDia(d.v)}
                        className="h-4 w-4 accent-emerald-500" />
                      <span className="text-sm text-white">{d.lbl}</span>
                    </label>
                    {cfgDia && (
                      <>
                        <input type="time" value={cfgDia.inicio}
                          onChange={e => alterarHorario(idx, "inicio", e.target.value)}
                          className="rounded border border-white/10 bg-slate-950 px-2 py-1 text-sm text-white" />
                        <span className="text-slate-500">até</span>
                        <input type="time" value={cfgDia.fim}
                          onChange={e => alterarHorario(idx, "fim", e.target.value)}
                          className="rounded border border-white/10 bg-slate-950 px-2 py-1 text-sm text-white" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Mensagem quando fora do horário (mostrada no chat bubble)
            </label>
            <textarea value={cfg.mensagem_offline} rows={3}
              onChange={e => setCfg({ ...cfg, mensagem_offline: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white resize-none" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              E-mail da equipe (notificação de chamado novo)
            </label>
            <input type="email" value={cfg.email_chamado ?? ""}
              onChange={e => setCfg({ ...cfg, email_chamado: e.target.value || null })}
              placeholder="suporte@tthreedigital.com.br"
              className="w-full max-w-md rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
          </div>
        </div>
      )}

      {/* Tab: EMAIL */}
      {tab === "email" && (
        <div className="space-y-5">
          <Alert>
            Variáveis disponíveis: <code className="text-emerald-400">{"{empresa} {cliente} {assunto} {mensagem} {link} {prioridade} {operador}"}</code>
          </Alert>

          <Section title="Resposta ao cliente (quando agente responde)">
            <Field label="Assunto"
              value={cfg.email_subject_resposta}
              onChange={v => setCfg({ ...cfg, email_subject_resposta: v })} />
            <Field label="Corpo HTML" multiline
              value={cfg.email_html_resposta}
              onChange={v => setCfg({ ...cfg, email_html_resposta: v })} />
          </Section>

          <Section title="Notificação à equipe (quando chamado novo)">
            <Field label="Assunto"
              value={cfg.email_subject_chamado_novo}
              onChange={v => setCfg({ ...cfg, email_subject_chamado_novo: v })} />
            <Field label="Corpo HTML" multiline
              value={cfg.email_html_chamado_novo}
              onChange={v => setCfg({ ...cfg, email_html_chamado_novo: v })} />
          </Section>
        </div>
      )}

      {/* Tab: WHATSAPP */}
      {tab === "whatsapp" && (
        <div className="space-y-5">
          <Alert>
            Variáveis: <code className="text-emerald-400">{"{operador} {assunto} {mensagem} {link} {cliente} {empresa} {usuario_nome} {codigo}"}</code><br/>
            Use <code>\n</code> pra quebra de linha. <code>*texto*</code> deixa em negrito no WhatsApp.
          </Alert>

          <Section title="Resposta ao cliente (botão Disparar WhatsApp no chat)">
            <Field label="Mensagem" multiline
              value={cfg.whatsapp_resposta_cliente}
              onChange={v => setCfg({ ...cfg, whatsapp_resposta_cliente: v })} />
          </Section>

          <Section title="Validação 2FA — Admin (6 dígitos, selo azul)">
            <Field label="Mensagem" multiline
              value={cfg.whatsapp_validacao_admin}
              onChange={v => setCfg({ ...cfg, whatsapp_validacao_admin: v })} />
          </Section>

          <Section title="Validação 2FA — Usuário (4 dígitos, selo amarelo)">
            <Field label="Mensagem" multiline
              value={cfg.whatsapp_validacao_usuario}
              onChange={v => setCfg({ ...cfg, whatsapp_validacao_usuario: v })} />
          </Section>
        </div>
      )}
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
      💡 {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900 p-4 space-y-3">
      <h3 className="text-sm font-bold text-white">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, multiline }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-400">{label}</label>
      {multiline ? (
        <textarea value={value} rows={6} onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white font-mono resize-none" />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
      )}
    </div>
  );
}
