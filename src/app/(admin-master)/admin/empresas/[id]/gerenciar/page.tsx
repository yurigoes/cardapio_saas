"use client";

/**
 * /admin/empresas/[id]/gerenciar
 *
 * Painel de ações administrativas que o MASTER usa pra resolver
 * problemas de cliente sem precisar acessar a VPS via SSH.
 *
 * Cada ação é um POST /api/admin/empresas/[id]/acoes com {acao,params}.
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Shield, KeyRound, Users, LogOut, Trash2, AlertTriangle,
  RefreshCw, Activity, Pause, Play, Database, ArrowLeft,
  Copy, Check as CheckIcon, Mail, Dice5, Pencil, X as XIcon,
} from "lucide-react";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";

interface Empresa {
  id: string; nome_fantasia: string; status: string;
  email: string; whatsapp: string; modulos_ativos: string[];
}

interface Usuario {
  id: string; nome: string; email: string; role: string;
  ativo: boolean; bloqueado_ate: string | null;
}

interface Stats {
  tabelas: Record<string, number | string>;
  pedidos_30d_por_status: { status: string; n: string }[];
}

const fmt = (n: number | string | undefined) =>
  typeof n === "number" ? n.toLocaleString("pt-BR") : (n ?? "—");

export default function GerenciarEmpresaPage() {
  const router      = useRouter();
  const { id }      = useParams<{ id: string }>();
  const [empresa, setEmpresa]   = useState<Empresa | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [busy, setBusy]         = useState<string | null>(null);
  const [msg, setMsg]           = useState<{ ok: boolean; texto: string } | null>(null);

  // Modal reset senha
  const [resetAlvo, setResetAlvo]       = useState<Usuario | null>(null);
  const [resetModo, setResetModo]       = useState<"escolher" | "manual" | "resultado">("escolher");
  const [resetSenha, setResetSenha]     = useState("");
  const [resetCustom, setResetCustom]   = useState("");
  const [resetEnviarEmail, setResetEnviarEmail] = useState(true);
  const [resetEmailStatus, setResetEmailStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [resetCopiado, setResetCopiado] = useState(false);
  const [resetBusy, setResetBusy]       = useState(false);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    try {
      const [e, u] = await Promise.all([
        fetch(`/api/admin/empresas/${id}`,           { headers: auth() }).then(r => r.json()),
        fetch(`/api/admin/empresas/${id}/usuarios`,  { headers: auth() }).then(r => r.json()).catch(() => ({ data: [] })),
      ]);
      if (e.success) setEmpresa(e.data);
      if (u.success) setUsuarios(u.data ?? []);
    } catch {}
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function executar(acao: string, params?: Record<string, unknown>, label?: string) {
    setBusy(acao);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/empresas/${id}/acoes`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ acao, params }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg({ ok: true, texto: `✓ ${label ?? acao} — ${JSON.stringify(d.data?.result ?? d.data ?? {})}` });
        if (acao === "estatisticas-rapidas") setStats(d.data?.result as Stats);
        carregar();
      } else {
        setMsg({ ok: false, texto: `✗ ${d.error?.message ?? d.error ?? "Falha"}` });
      }
    } catch (err) {
      setMsg({ ok: false, texto: `✗ ${(err as Error).message}` });
    } finally { setBusy(null); }
  }

  function abrirResetSenha(usuario: Usuario) {
    setResetAlvo(usuario);
    setResetModo("escolher");
    setResetSenha("");
    setResetCustom("");
    setResetEnviarEmail(true);
    setResetEmailStatus("idle");
    setResetCopiado(false);
  }

  function fecharResetSenha() {
    setResetAlvo(null);
    setResetSenha("");
    setResetCustom("");
  }

  function gerarSenhaRandom8(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  async function confirmarResetSenha(senhaParaUsar: string) {
    if (!resetAlvo) return;
    if (senhaParaUsar.length < 8) {
      await alertar({ titulo: "Senha muito curta", mensagem: "Mínimo 8 caracteres.", tipo: "alerta" });
      return;
    }
    setResetBusy(true);
    try {
      const r = await fetch(`/api/admin/empresas/${id}/acoes`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({
          acao: "reset-senha-usuario",
          params: {
            usuario_id:   resetAlvo.id,
            nova_senha:   senhaParaUsar,
            enviar_email: resetEnviarEmail,
          },
        }),
      });
      const d = await r.json();
      if (!d.success) {
        setMsg({ ok: false, texto: `✗ ${d.error?.message ?? "Falha"}` });
        return;
      }
      setResetSenha(senhaParaUsar);
      setResetEmailStatus(
        resetEnviarEmail
          ? (d.data?.result?.email_enviado ? "ok" : "fail")
          : "idle"
      );
      setResetModo("resultado");
      carregar();
    } catch (err) {
      setMsg({ ok: false, texto: `✗ ${(err as Error).message}` });
    } finally {
      setResetBusy(false);
    }
  }

  async function copiarSenha() {
    try {
      await navigator.clipboard.writeText(resetSenha);
      setResetCopiado(true);
      setTimeout(() => setResetCopiado(false), 2000);
    } catch {
      await alertar({ titulo: "Falha ao copiar", mensagem: "Copie manualmente.", tipo: "alerta" });
    }
  }

  async function zerarDados() {
    const confirm1 = prompt(
      `⚠ Isto vai APAGAR TODOS pedidos, caixas, vales, comandas, jobs de impressão da "${empresa?.nome_fantasia}".\n\n` +
      `Mantém: produtos, usuários, mesas, configs.\n\n` +
      `Pra confirmar, digite o nome da empresa:`
    );
    if (confirm1 !== empresa?.nome_fantasia) {
      if (confirm1 !== null) await alertar({ titulo: "Nome não confere", mensagem: "Cancelado.", tipo: "alerta" });
      return;
    }
    await executar("zerar-dados-operacionais", {}, "Dados operacionais zerados");
  }

  async function suspender() {
    if (!await confirmar({ titulo: `Suspender "${empresa?.nome_fantasia}"?`, mensagem: "Usuários não conseguirão logar.", okLabel: "Suspender", perigo: true })) return;
    await executar("suspender", {}, "Empresa suspensa");
  }

  async function reativar() {
    await executar("reativar", {}, "Empresa reativada");
  }

  async function forcarLogout() {
    if (!await confirmar({ titulo: "Forçar logout de TODOS os usuários?", mensagem: "Todas as sessões ativas dessa empresa serão revogadas.", okLabel: "Forçar logout", perigo: true })) return;
    await executar("forcar-logout-todos", {}, "Sessões revogadas");
  }

  async function desbloquearUsuarios() {
    await executar("desbloquear-usuarios", {}, "Usuários desbloqueados");
  }

  async function apagarEmpresa() {
    const txt = prompt(
      `🚨 APAGAR DEFINITIVAMENTE "${empresa?.nome_fantasia}"?\n\n` +
      `Marca a empresa como deleted_at. Os dados ficam no banco mas inacessíveis.\n\n` +
      `Pra confirmar, digite EXATAMENTE: APAGAR ${empresa?.nome_fantasia}`
    );
    if (txt !== `APAGAR ${empresa?.nome_fantasia}`) {
      if (txt !== null) await alertar({ titulo: "Texto não confere", mensagem: "Cancelado.", tipo: "alerta" });
      return;
    }
    setBusy("delete");
    const r = await fetch(`/api/admin/empresas/${id}`, { method: "DELETE", headers: auth() });
    const d = await r.json();
    setBusy(null);
    if (d.success) { await alertar({ titulo: "Empresa apagada", tipo: "sucesso" }); router.push("/admin/empresas"); }
    else await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
  }

  async function impersonar() {
    const r = await fetch(`/api/admin/empresas/${id}/impersonar`, { method: "POST", headers: auth() });
    const d = await r.json();
    if (d.success && d.data?.access_token) {
      localStorage.setItem("access_token", d.data.access_token);
      window.location.href = "/painel";
    } else {
      await alertar({ titulo: "Falha ao impersonar", mensagem: d.error?.message ?? "", tipo: "perigo" });
    }
  }

  if (!empresa) return <div className="p-8 text-slate-400">Carregando...</div>;

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/admin/empresas/${id}`)}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
              <Shield className="h-5 w-5 text-amber-400" />
              Gerenciar — {empresa.nome_fantasia}
            </h1>
            <p className="text-sm text-slate-400">
              Status: <span className={`font-mono ${
                empresa.status === "ativo"     ? "text-emerald-400" :
                empresa.status === "suspenso"  ? "text-amber-400"   :
                                                  "text-red-400"
              }`}>{empresa.status}</span>
              {"  ·  "} {empresa.email} · {empresa.whatsapp}
            </p>
          </div>
        </div>
        <button
          onClick={carregar}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {msg && (
        <div className={`rounded-xl border p-3 text-sm ${
          msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                 : "border-red-500/30 bg-red-500/10 text-red-200"
        }`}>
          <pre className="whitespace-pre-wrap break-all font-mono text-xs">{msg.texto}</pre>
        </div>
      )}

      {/* Acesso */}
      <Section title="Acesso" icon={KeyRound}>
        <Btn label="Login como esta empresa (impersonar)"
             onClick={impersonar} busy={busy === "impersonar"} />
        {empresa.status !== "suspenso" ? (
          <Btn variant="warning" label="Suspender" icon={Pause}
               onClick={suspender} busy={busy === "suspender"} />
        ) : (
          <Btn variant="success" label="Reativar" icon={Play}
               onClick={reativar} busy={busy === "reativar"} />
        )}
        <Btn variant="warning" label="Forçar logout de todos" icon={LogOut}
             onClick={forcarLogout} busy={busy === "forcar-logout-todos"} />
        <Btn label="Desbloquear contas travadas"
             onClick={desbloquearUsuarios} busy={busy === "desbloquear-usuarios"} />
      </Section>

      {/* Usuários */}
      <Section title={`Usuários (${usuarios.length})`} icon={Users}>
        {usuarios.length === 0 ? (
          <p className="col-span-full text-sm text-slate-500 py-2">
            Endpoint /usuarios não retornou dados — pode não estar implementado.
          </p>
        ) : (
          <div className="col-span-full divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
            {usuarios.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {u.nome} <span className="text-xs font-normal text-slate-500">· {u.role}</span>
                  </p>
                  <p className="text-xs text-slate-500 truncate">{u.email}</p>
                </div>
                {!u.ativo && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">INATIVO</span>}
                {u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date() &&
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">BLOQ</span>
                }
                <button
                  onClick={() => abrirResetSenha(u)}
                  disabled={busy !== null}
                  className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-40"
                >
                  Resetar senha
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Diagnóstico */}
      <Section title="Diagnóstico" icon={Activity}>
        <Btn label="Estatísticas rápidas (contagens)"
             onClick={() => executar("estatisticas-rapidas", {}, "Stats")}
             busy={busy === "estatisticas-rapidas"} />
        {stats && (
          <div className="col-span-full grid gap-3 sm:grid-cols-2 mt-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase font-semibold text-slate-500 mb-2">Tabelas</p>
              <div className="space-y-1 text-xs">
                {Object.entries(stats.tabelas).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-400">{k}</span>
                    <span className="font-mono text-white">{fmt(v)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase font-semibold text-slate-500 mb-2">Pedidos últimos 30d</p>
              <div className="space-y-1 text-xs">
                {stats.pedidos_30d_por_status.length === 0 ? (
                  <p className="text-slate-500">Sem pedidos nos últimos 30d</p>
                ) : stats.pedidos_30d_por_status.map(s => (
                  <div key={s.status} className="flex justify-between">
                    <span className="text-slate-400">{s.status}</span>
                    <span className="font-mono text-white">{fmt(parseInt(s.n, 10))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* Zona de perigo */}
      <Section title="Zona de perigo" icon={AlertTriangle} danger>
        <Btn variant="warning" label="Zerar dados operacionais (pedidos, caixa, vales)"
             icon={Database}
             onClick={zerarDados} busy={busy === "zerar-dados-operacionais"} />
        <Btn variant="danger" label="Apagar empresa definitivamente"
             icon={Trash2}
             onClick={apagarEmpresa} busy={busy === "delete"} />
      </Section>

      {/* Modal reset senha */}
      {resetAlvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h3 className="flex items-center gap-2 text-base font-bold text-white">
                <KeyRound className="h-5 w-5 text-emerald-400" />
                Resetar senha
              </h3>
              <button onClick={fecharResetSenha} className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-400">
                Usuário: <strong className="text-white">{resetAlvo.nome}</strong>
                <br />
                <span className="font-mono text-xs">{resetAlvo.email}</span>
              </p>

              {resetModo === "escolher" && (
                <>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resetEnviarEmail}
                      onChange={(e) => setResetEnviarEmail(e.target.checked)}
                      className="rounded border-white/20 bg-white/5"
                    />
                    <Mail className="h-3.5 w-3.5" />
                    Enviar nova senha por email
                  </label>

                  <div className="grid grid-cols-1 gap-2">
                    <button
                      disabled={resetBusy}
                      onClick={() => confirmarResetSenha(gerarSenhaRandom8())}
                      className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      <Dice5 className="h-4 w-4" />
                      Gerar senha aleatória (8 dígitos)
                    </button>
                    <button
                      disabled={resetBusy}
                      onClick={() => setResetModo("manual")}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:opacity-40"
                    >
                      <Pencil className="h-4 w-4" />
                      Definir senha manualmente
                    </button>
                  </div>
                </>
              )}

              {resetModo === "manual" && (
                <>
                  <input
                    type="text"
                    value={resetCustom}
                    onChange={(e) => setResetCustom(e.target.value)}
                    placeholder="Digite a nova senha (mínimo 8)"
                    autoFocus
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white font-mono focus:border-emerald-500/50 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500">
                    {resetCustom.length}/8 caracteres mínimos
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setResetModo("escolher")}
                      className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
                    >
                      Voltar
                    </button>
                    <button
                      disabled={resetBusy || resetCustom.length < 8}
                      onClick={() => confirmarResetSenha(resetCustom)}
                      className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {resetBusy ? "Resetando..." : "Confirmar reset"}
                    </button>
                  </div>
                </>
              )}

              {resetModo === "resultado" && (
                <>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                    <p className="text-[11px] uppercase tracking-wider text-emerald-300 mb-2 font-bold">
                      ✓ Nova senha
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded bg-black/30 px-3 py-2 font-mono text-lg text-white tracking-wider">
                        {resetSenha}
                      </code>
                      <button
                        onClick={copiarSenha}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 p-2 text-emerald-300 hover:bg-emerald-500/30"
                        title="Copiar"
                      >
                        {resetCopiado ? <CheckIcon className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {resetEmailStatus === "ok" && (
                    <p className="flex items-center gap-2 text-xs text-emerald-300">
                      <Mail className="h-3.5 w-3.5" />
                      Email enviado para {resetAlvo.email}
                    </p>
                  )}
                  {resetEmailStatus === "fail" && (
                    <p className="flex items-center gap-2 text-xs text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Senha resetada, mas falha ao enviar email. Compartilhe manualmente.
                    </p>
                  )}

                  <button
                    onClick={fecharResetSenha}
                    className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-400"
                  >
                    Concluir
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componentes ────────────────────────────────────────────

function Section({
  title, icon: Icon, danger, children,
}: { title: string; icon: React.ComponentType<{ className?: string }>; danger?: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border p-5 space-y-3 ${
      danger ? "border-red-500/20 bg-red-500/5" : "border-white/10 bg-white/5"
    }`}>
      <h2 className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${
        danger ? "text-red-400" : "text-slate-300"
      }`}>
        <Icon className="h-4 w-4" /> {title}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Btn({
  label, icon: Icon, variant = "default", onClick, busy,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: "default" | "success" | "warning" | "danger";
  onClick: () => void;
  busy?: boolean;
}) {
  const cls = {
    default: "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
    danger:  "border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
      <span className="truncate">{busy ? "..." : label}</span>
    </button>
  );
}
