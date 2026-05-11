"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Zap, Wifi, WifiOff, Clock, RefreshCw, Plus, Trash2,
  CheckCircle, AlertCircle, Loader2, Link, Key, ExternalLink,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type WaStatus = "conectado" | "aguardando" | "desconectado" | "nao_criada" | "carregando";

interface WaState {
  status:      WaStatus;
  slug:        string | null;
  qr:          string | null;
  pairingCode: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader() { return { Authorization: `Bearer ${getToken()}` }; }

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WaStatus }) {
  if (status === "carregando") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/15 px-3 py-1 text-xs font-medium text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Carregando...
      </span>
    );
  }
  if (status === "conectado") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
        <CheckCircle className="h-3 w-3" />
        Conectado
      </span>
    );
  }
  if (status === "aguardando") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-semibold text-yellow-400">
        <Clock className="h-3 w-3" />
        Aguardando QR
      </span>
    );
  }
  if (status === "nao_criada") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/15 px-3 py-1 text-xs font-semibold text-slate-400">
        <WifiOff className="h-3 w-3" />
        Não criada
      </span>
    );
  }
  // desconectado
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-400">
      <WifiOff className="h-3 w-3" />
      Desconectado
    </span>
  );
}

// ── Section Card wrapper ───────────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-6 ${className}`}>
      {children}
    </div>
  );
}

// ── WhatsApp Section ───────────────────────────────────────────────────────────

function WhatsAppSection() {
  const [wa,      setWa]      = useState<WaState>({
    status: "carregando", slug: null, qr: null, pairingCode: null,
  });
  const [acting,  setActing]  = useState(false);
  const [toast,   setToast]   = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch("/api/painel/whatsapp/instancia", { headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        setWa(data.data as WaState);
      }
    } catch {
      // silent — keep previous state
    }
  }, []);

  // Initial fetch
  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Poll every 15 s when not connected
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (wa.status !== "conectado" && wa.status !== "carregando") {
      intervalRef.current = setInterval(fetchStatus, 15_000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [wa.status, fetchStatus]);

  // Auto-refresh QR every 30 s when awaiting scan
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);

    if (wa.status === "aguardando" || wa.status === "desconectado") {
      qrIntervalRef.current = setInterval(async () => {
        try {
          const res  = await fetch("/api/painel/whatsapp/qr", { headers: authHeader() });
          const data = await res.json();
          if (data.success && data.data.qr) {
            setWa(prev => ({ ...prev, qr: data.data.qr, pairingCode: data.data.pairingCode }));
          }
        } catch {
          // silent
        }
      }, 30_000);
    }

    return () => {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    };
  }, [wa.status]);

  async function handleCriar() {
    setActing(true);
    try {
      const res  = await fetch("/api/painel/whatsapp/instancia", {
        method:  "POST",
        headers: authHeader(),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Instância criada! Escaneie o QR code.");
        await fetchStatus();
      } else {
        showToast("error", data.error ?? "Erro ao criar instância");
      }
    } catch {
      showToast("error", "Falha na conexão");
    } finally {
      setActing(false);
    }
  }

  async function handleReconectar() {
    setActing(true);
    try {
      const res  = await fetch("/api/painel/whatsapp/qr", { headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        if (data.data.qr) {
          setWa(prev => ({
            ...prev,
            status:      "aguardando",
            qr:          data.data.qr,
            pairingCode: data.data.pairingCode,
          }));
          showToast("success", "QR code atualizado. Escaneie para conectar.");
        } else {
          showToast("error", "Não foi possível obter o QR code agora. Tente em instantes.");
        }
      } else {
        showToast("error", data.error ?? "Erro ao reconectar");
      }
    } catch {
      showToast("error", "Falha na conexão");
    } finally {
      setActing(false);
    }
  }

  async function handleRemover() {
    if (!confirm("Tem certeza que deseja remover a instância do WhatsApp? Isso desconectará o número.")) return;
    setActing(true);
    try {
      const res  = await fetch("/api/painel/whatsapp/instancia", {
        method:  "DELETE",
        headers: authHeader(),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Instância removida com sucesso.");
        setWa({ status: "nao_criada", slug: wa.slug, qr: null, pairingCode: null });
      } else {
        showToast("error", data.error ?? "Erro ao remover instância");
      }
    } catch {
      showToast("error", "Falha na conexão");
    } finally {
      setActing(false);
    }
  }

  const notCreated   = wa.status === "nao_criada";
  const isConnected  = wa.status === "conectado";
  const showQR       = (wa.status === "aguardando" || wa.status === "desconectado") && wa.qr;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            {/* WA icon */}
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10">
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-emerald-400" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-base font-semibold text-white">WhatsApp Business</h3>
                <StatusBadge status={wa.status} />
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Conecte seu número via Evolution API para automações e notificações
              </p>
              {wa.slug && (
                <p className="mt-1 text-xs text-slate-500">
                  Instância: <span className="font-mono text-slate-400">{wa.slug}</span>
                </p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            {notCreated && (
              <button
                onClick={handleCriar}
                disabled={acting}
                className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-400 disabled:opacity-50 transition"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar instância
              </button>
            )}
            {!notCreated && !isConnected && (
              <button
                onClick={handleReconectar}
                disabled={acting}
                className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Reconectar
              </button>
            )}
            {isConnected && (
              <button
                onClick={handleReconectar}
                disabled={acting}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 disabled:opacity-50 transition"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar QR
              </button>
            )}
            {!notCreated && (
              <button
                onClick={handleRemover}
                disabled={acting}
                className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remover
              </button>
            )}
          </div>
        </div>
      </SectionCard>

      {/* QR Code card */}
      {showQR && (
        <SectionCard>
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* QR image */}
            <div className="flex-shrink-0">
              <div className="rounded-2xl bg-white p-3 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={wa.qr!.startsWith("data:") ? wa.qr! : `data:image/png;base64,${wa.qr}`}
                  alt="QR Code WhatsApp"
                  className="h-48 w-48 object-contain"
                />
              </div>
              <p className="mt-2 text-center text-xs text-slate-500">
                Atualiza automaticamente a cada 30s
              </p>
            </div>

            {/* Instructions */}
            <div className="flex-1 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-white mb-1">Como conectar</h4>
                <ol className="space-y-2 text-sm text-slate-400">
                  {[
                    "Abra o WhatsApp no seu celular",
                    'Toque em "Mais opções" (⋮) ou "Configurações"',
                    'Selecione "Dispositivos vinculados"',
                    'Toque em "Vincular um dispositivo"',
                    "Escaneie o QR code ao lado",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {wa.pairingCode && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-slate-400 mb-1">Código de emparelhamento alternativo</p>
                  <p className="font-mono text-lg font-bold text-white tracking-widest">
                    {wa.pairingCode}
                  </p>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Connected info */}
      {isConnected && (
        <SectionCard>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <Wifi className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">WhatsApp conectado</p>
              <p className="text-xs text-slate-400">
                Seu número está ativo e pronto para automações via N8N
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur-sm ${
          toast.type === "success"
            ? "border-emerald-500/30 bg-slate-900/90 text-emerald-300"
            : "border-red-500/30 bg-slate-900/90 text-red-300"
        }`}>
          {toast.type === "success"
            ? <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-400" />
            : <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
          }
          <span className="text-sm font-medium">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

// ── N8N Section ────────────────────────────────────────────────────────────────

function N8NSection() {
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "";
  const webhookUrl = baseDomain ? `https://n8n.${baseDomain}/webhook/cardapio` : "—";

  // N8N API key is server-only; we show a masked placeholder
  const maskedKey = "••••••••••••••••";

  return (
    <SectionCard>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {/* N8N icon */}
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-orange-500/10">
            <Zap className="h-7 w-7 text-orange-400" />
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-base font-semibold text-white">N8N Automações</h3>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
                  <CheckCircle className="h-3 w-3" />
                  Configurado
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Configure seus workflows em N8N para automatizar mensagens, notificações de pedidos e muito mais.
              </p>
            </div>

            {/* Info rows */}
            <div className="space-y-2 pt-1">
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <Link className="h-4 w-4 flex-shrink-0 text-slate-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 mb-0.5">Webhook URL</p>
                  <p className="text-sm font-mono text-white break-all">{webhookUrl}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <Key className="h-4 w-4 flex-shrink-0 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">API Key (N8N)</p>
                  <p className="text-sm font-mono text-white">{maskedKey}</p>
                </div>
              </div>
            </div>

            {baseDomain && (
              <a
                href={`https://n8n.${baseDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 transition"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir N8N
              </a>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Placeholder card (iFood / Rappi) ──────────────────────────────────────────

function PlaceholderSection({
  name,
  description,
  color,
  initial,
}: {
  name:        string;
  description: string;
  color:       string;
  initial:     string;
}) {
  return (
    <SectionCard>
      <div className="flex items-start gap-4">
        {/* Logo placeholder */}
        <div
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white"
          style={{ background: color }}
        >
          {initial}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-white">{name}</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/15 px-3 py-1 text-xs font-semibold text-slate-400">
              Em desenvolvimento
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function IntegracoesPage() {
  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap className="h-6 w-6 text-emerald-400" />
          Integrações
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Conecte sua conta com plataformas externas para automações e pedidos
        </p>
      </div>

      {/* ── Section 1: WhatsApp ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-white/5" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">WhatsApp</h2>
          <div className="h-px flex-1 bg-white/5" />
        </div>
        <WhatsAppSection />
      </section>

      {/* ── Section 2: N8N ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-white/5" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Automações</h2>
          <div className="h-px flex-1 bg-white/5" />
        </div>
        <N8NSection />
      </section>

      {/* ── Section 3 & 4: Marketplaces ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-white/5" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Marketplaces</h2>
          <div className="h-px flex-1 bg-white/5" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <PlaceholderSection
            name="iFood"
            description="Integração com iFood em breve. Receba e gerencie pedidos do iFood diretamente pelo painel."
            color="#ea1d2c"
            initial="iF"
          />
          <PlaceholderSection
            name="Rappi"
            description="Integração com Rappi em breve. Sincronize seu cardápio e pedidos automaticamente."
            color="#ff441f"
            initial="R"
          />
        </div>
      </section>
    </div>
  );
}
