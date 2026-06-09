"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldOff, QrCode, Copy } from "lucide-react";
import { notify, confirmModal } from "@/components/Notify";

declare global { interface Window { QRCode?: { toCanvas: (c: HTMLCanvasElement, t: string, o: object, cb: (err?: Error) => void) => void } } }

let _qrLoaded = false;
async function carregarQR() {
  if (_qrLoaded || typeof window === "undefined" || window.QRCode) { _qrLoaded = true; return; }
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha QR"));
    document.head.appendChild(s);
  });
  _qrLoaded = true;
}

export function Seguranca2FA({ token }: { token: string }) {
  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/admin/2fa/setup", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => d.ok && setAtivo(d.ativo)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!setup) return;
    (async () => {
      await carregarQR();
      const c = document.getElementById("qr-2fa") as HTMLCanvasElement | null;
      if (c && window.QRCode) {
        window.QRCode.toCanvas(c, setup.uri, { width: 220, margin: 1, color: { dark: "#7c3aed", light: "#ffffff" } }, () => {});
      }
    })();
  }, [setup]);

  async function iniciarSetup() {
    setBusy(true); setErr("");
    const r = await fetch("/api/admin/2fa/setup", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    setSetup({ secret: d.secret, uri: d.otpauth_uri });
  }

  async function confirmar() {
    if (!/^\d{6}$/.test(otp)) { setErr("Digite os 6 dígitos"); return; }
    setBusy(true); setErr("");
    const r = await fetch("/api/admin/2fa/setup", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ token: otp }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Código inválido"); return; }
    notify("2FA ativado!", "success");
    setAtivo(true); setSetup(null); setOtp("");
  }

  async function desativar() {
    if (!await confirmModal("Desativar 2FA? Login voltará a exigir só email + senha.")) return;
    setBusy(true);
    const r = await fetch("/api/admin/2fa/setup", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    notify("2FA desativado", "info"); setAtivo(false); setSetup(null);
  }

  function copiarSecret() {
    if (!setup) return;
    navigator.clipboard.writeText(setup.secret);
    notify("Secret copiado", "success");
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center gap-3">
        {ativo ? <ShieldCheck className="h-6 w-6 text-emerald-400" /> : <ShieldOff className="h-6 w-6 text-slate-400" />}
        <div>
          <p className="font-semibold">Autenticação em 2 fatores (2FA)</p>
          <p className="text-xs text-slate-400">
            {ativo === null ? "Verificando..." : ativo ? "Ativado — login exige código do app autenticador" : "Desativado — apenas email + senha"}
          </p>
        </div>
      </div>

      {ativo === false && !setup && (
        <button onClick={iniciarSetup} disabled={busy} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Ativar 2FA
        </button>
      )}

      {ativo === true && (
        <button onClick={desativar} disabled={busy} className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50">
          Desativar 2FA
        </button>
      )}

      {setup && (
        <div className="mt-4 space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <div>
            <p className="mb-2 text-sm font-semibold">1. Escaneie no Google Authenticator, Authy ou 1Password</p>
            <div className="flex flex-col items-center gap-3 md:flex-row md:items-start">
              <div className="rounded-xl bg-white p-3"><canvas id="qr-2fa" /></div>
              <div className="text-xs text-slate-400">
                <p className="mb-1">Ou digite o secret manualmente:</p>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-black/40 px-2 py-1 font-mono text-amber-300">{setup.secret}</code>
                  <button onClick={copiarSecret} title="Copiar" className="rounded border border-white/20 p-1 hover:bg-white/10"><Copy className="h-3 w-3" /></button>
                </div>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">2. Digite o código de 6 dígitos do app</p>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="123456" className="w-40 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-brand/50" />
              <button onClick={confirmar} disabled={busy || otp.length !== 6} className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar e ativar"}
              </button>
            </div>
          </div>
          {err && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
          <button onClick={() => { setSetup(null); setOtp(""); setErr(""); }} className="text-xs text-slate-400 hover:text-white">Cancelar</button>
        </div>
      )}

      {err && !setup && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
    </div>
  );
}
