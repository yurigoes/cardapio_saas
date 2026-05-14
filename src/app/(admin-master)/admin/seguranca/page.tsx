"use client";

/**
 * /admin/seguranca — gerencia 2FA TOTP do master.
 *
 * Fluxo:
 *   - Status: ativo? quando? recovery codes restantes?
 *   - Ativar: setup → mostra QR → digite código → confirma
 *   - Desativar: pede senha
 *   - Mostrar recovery codes (só na ativação inicial)
 */
import { useEffect, useState, useCallback } from "react";
import {
  Shield, ShieldCheck, ShieldAlert, KeyRound, Loader2, Copy, Check,
  AlertTriangle, Eye, EyeOff, ScanLine, Download,
} from "lucide-react";
import { alertar, confirmar } from "@/components/ui/ConfirmModal";

interface Status {
  ativo: boolean;
  ativado_em: string | null;
  ultimo_uso: string | null;
  recovery_codes_restantes: number;
}

interface SetupData {
  secret:      string;
  otpauth_uri: string;
  qr_data_url: string;
}

function authHeader(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

export default function SegurancaPage() {
  const [status, setStatus]   = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  // Setup state
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [codigo, setCodigo]       = useState("");
  const [verificando, setVerificando] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Disable state
  const [disableOpen, setDisableOpen] = useState(false);
  const [senhaDis, setSenhaDis]       = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [desativando, setDesativando] = useState(false);

  const [copiouSecret, setCopiouSecret] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/auth/2fa/status", { headers: authHeader() });
      const d = await r.json();
      if (d.success) setStatus(d.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function iniciarSetup() {
    setSetupData(null);
    setCodigo("");
    setRecoveryCodes(null);
    try {
      const r = await fetch("/api/auth/2fa/setup", { method: "POST", headers: authHeader() });
      const d = await r.json();
      if (d.success) setSetupData(d.data);
      else await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
    } catch { await alertar({ titulo: "Erro de rede", tipo: "perigo" }); }
  }

  async function verificarSetup() {
    if (!setupData || codigo.length !== 6) return;
    setVerificando(true);
    try {
      const r = await fetch("/api/auth/2fa/verify", {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ secret: setupData.secret, codigo }),
      });
      const d = await r.json();
      if (d.success && d.data?.recovery_codes) {
        setRecoveryCodes(d.data.recovery_codes);
        setSetupData(null);
        setCodigo("");
        carregar();
      } else {
        await alertar({ titulo: "Código inválido", mensagem: d.error?.message ?? "Tente o código atual do app", tipo: "alerta" });
      }
    } finally { setVerificando(false); }
  }

  async function desativar() {
    if (!senhaDis.trim()) return;
    setDesativando(true);
    try {
      const r = await fetch("/api/auth/2fa/disable", {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ senha: senhaDis }),
      });
      const d = await r.json();
      if (d.success) {
        await alertar({ titulo: "✓ 2FA desativado", mensagem: d.data?.mensagem ?? "", tipo: "sucesso" });
        setDisableOpen(false);
        setSenhaDis("");
        carregar();
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
      }
    } finally { setDesativando(false); }
  }

  function copiarSecret() {
    if (!setupData) return;
    navigator.clipboard.writeText(setupData.secret).then(() => {
      setCopiouSecret(true);
      setTimeout(() => setCopiouSecret(false), 2000);
    });
  }

  function baixarRecovery() {
    if (!recoveryCodes) return;
    const txt = `Recovery codes 2FA — guarde em local seguro\nGerado em: ${new Date().toLocaleString("pt-BR")}\n\n` +
      recoveryCodes.map((c, i) => `${i + 1}. ${c}`).join("\n") +
      `\n\nCada código vale 1 uso. Use se perder acesso ao app authenticator.`;
    const blob = new Blob([txt], { type: "text/plain" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = "recovery-codes-2fa.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (loading) return (
    <div className="flex h-60 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl pb-12">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <Shield className="h-5 w-5 text-emerald-400" /> Segurança · 2FA
        </h1>
        <p className="mt-0.5 text-sm text-slate-400">
          Autenticação de 2 fatores via app authenticator (Google/Authy/1Password).
          Recomendada pra contas master.
        </p>
      </div>

      {/* Status */}
      <section className={`rounded-2xl border p-5 ${
        status?.ativo
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      }`}>
        <div className="flex items-center gap-3">
          {status?.ativo
            ? <ShieldCheck className="h-7 w-7 text-emerald-400" />
            : <ShieldAlert className="h-7 w-7 text-amber-400" />}
          <div className="flex-1">
            <p className="text-base font-bold text-white">
              {status?.ativo ? "2FA ativo" : "2FA desativado"}
            </p>
            <p className="text-xs text-slate-400">
              {status?.ativo ? (
                <>
                  Ativado {status.ativado_em ? new Date(status.ativado_em).toLocaleString("pt-BR") : ""} ·
                  Recovery codes restantes: <strong className={`${
                    status.recovery_codes_restantes < 3 ? "text-amber-300" : "text-emerald-300"
                  }`}>{status.recovery_codes_restantes}/8</strong>
                  {status.ultimo_uso && (
                    <> · Último uso: {new Date(status.ultimo_uso).toLocaleString("pt-BR")}</>
                  )}
                </>
              ) : (
                <>Sem 2FA, sua conta depende só da senha. Recomendado ativar.</>
              )}
            </p>
          </div>
          {status?.ativo ? (
            <button onClick={() => setDisableOpen(true)}
              className="rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-4 py-2 text-sm font-bold text-red-300">
              Desativar
            </button>
          ) : (
            <button onClick={iniciarSetup}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-sm font-bold text-white">
              <ScanLine className="h-4 w-4" /> Ativar 2FA
            </button>
          )}
        </div>
      </section>

      {/* Setup wizard */}
      {setupData && (
        <section className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-blue-400" />
            <h2 className="font-bold text-white">Configurar app authenticator</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            {/* QR */}
            <div className="rounded-xl border border-white/10 bg-white p-3 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setupData.qr_data_url} alt="QR code 2FA" className="w-full" />
            </div>
            <div className="space-y-3">
              <ol className="text-sm text-slate-300 space-y-1.5 list-decimal list-inside">
                <li>Abra Google Authenticator, Authy ou 1Password</li>
                <li>Escaneie o QR code ou digite a chave manualmente</li>
                <li>Digite o código de 6 dígitos abaixo pra confirmar</li>
              </ol>

              <div className="rounded-lg border border-white/10 bg-slate-900 p-2 flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-emerald-300 break-all">
                  {setupData.secret}
                </code>
                <button onClick={copiarSecret}
                  className="rounded bg-emerald-500 p-1.5 text-white hover:brightness-110">
                  {copiouSecret ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="flex gap-2">
                <input type="text" inputMode="numeric" pattern="\d{6}" maxLength={6}
                  value={codigo}
                  onChange={e => setCodigo(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-center text-xl font-mono tracking-[0.4em] text-white" />
                <button onClick={verificarSetup}
                  disabled={verificando || codigo.length !== 6}
                  className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Recovery codes (mostra só uma vez) */}
      {recoveryCodes && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-emerald-400" />
            <h2 className="font-bold text-white">2FA ativado · Salve os recovery codes</h2>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-200">
              <strong>Esses códigos não vão aparecer de novo.</strong> Salve em local seguro
              (gerenciador de senhas, papel guardado). Cada um vale 1 uso pra entrar
              caso perca acesso ao app authenticator.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((c, i) => (
              <code key={i} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-mono text-emerald-300 text-center">
                {c}
              </code>
            ))}
          </div>
          <button onClick={baixarRecovery}
            className="flex items-center gap-2 rounded-xl bg-blue-500 hover:bg-blue-400 px-4 py-2 text-sm font-bold text-white">
            <Download className="h-4 w-4" /> Baixar como .txt
          </button>
        </section>
      )}

      {/* Modal desativar */}
      {disableOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur p-4"
             onClick={() => !desativando && setDisableOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-900 shadow-2xl p-6 space-y-4"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-red-400" />
              <h2 className="text-lg font-bold text-white">Desativar 2FA?</h2>
            </div>
            <p className="text-sm text-slate-400">
              Sua conta vai depender só da senha. Confirme com sua senha:
            </p>
            <div className="relative">
              <input type={mostrarSenha ? "text" : "password"} value={senhaDis}
                onChange={e => setSenhaDis(e.target.value)}
                placeholder="Senha atual"
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 pr-10 text-sm text-white" />
              <button type="button"
                onClick={() => setMostrarSenha(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDisableOpen(false)} disabled={desativando}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">
                Cancelar
              </button>
              <button onClick={desativar} disabled={desativando || !senhaDis.trim()}
                className="flex items-center gap-2 rounded-xl bg-red-500 hover:bg-red-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                {desativando && <Loader2 className="h-4 w-4 animate-spin" />}
                Desativar 2FA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
