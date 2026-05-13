"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Zap, Wifi, WifiOff, Clock, RefreshCw, Plus, Trash2,
  CheckCircle, AlertCircle, Loader2, Link2, Key, Eye, EyeOff, Save,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type WaStatus = "conectado" | "aguardando" | "desconectado" | "nao_criada" | "carregando";

interface WaState {
  status:      WaStatus;
  slug:        string | null;
  qr:          string | null;
  pairingCode: string | null;
}

interface EmpresaConfig {
  evolution_url:    string;
  evolution_key:    string;
  evolution_eventos: string[];
  n8n_url:          string;
  n8n_token:        string;
  n8n_eventos:      string[];
}

const WA_EVENTOS = [
  { id: "novo_pedido",    label: "Novo pedido recebido" },
  { id: "confirmado",     label: "Pedido confirmado" },
  { id: "pronto",         label: "Pedido pronto para retirada" },
  { id: "cancelado",      label: "Pedido cancelado" },
  { id: "novo_cliente",   label: "Novo cliente cadastrado" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}` };
}
function jsonHeader(): Record<string, string> {
  return { ...authHeader(), "Content-Type": "application/json" };
}

// ── Toast ──────────────────────────────────────────────────────────────────────

interface ToastMsg { type: "success" | "error"; msg: string }

function Toast({ toast }: { toast: ToastMsg }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur-sm ${
      toast.type === "success"
        ? "border-brand/30 bg-slate-900/90 text-brand"
        : "border-red-500/30 bg-slate-900/90 text-red-300"
    }`}>
      {toast.type === "success"
        ? <CheckCircle className="h-5 w-5 flex-shrink-0 text-brand" />
        : <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
      }
      <span className="text-sm font-medium">{toast.msg}</span>
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const show = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);
  return { toast, show };
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WaStatus }) {
  if (status === "carregando") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/15 px-3 py-1 text-xs font-medium text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
      </span>
    );
  }
  if (status === "conectado") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold text-brand">
        <CheckCircle className="h-3 w-3" /> Conectado
      </span>
    );
  }
  if (status === "aguardando") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-semibold text-yellow-400">
        <Clock className="h-3 w-3" /> Aguardando QR
      </span>
    );
  }
  if (status === "nao_criada") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/15 px-3 py-1 text-xs font-semibold text-slate-400">
        <WifiOff className="h-3 w-3" /> Não criada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-400">
      <WifiOff className="h-3 w-3" /> Desconectado
    </span>
  );
}

// ── Section Card ───────────────────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-6 ${className}`}>
      {children}
    </div>
  );
}

// ── Password input with show/hide ─────────────────────────────────────────────

function PasswordField({
  id, value, onChange, placeholder, disabled,
}: {
  id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/30 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ── Eventos checkboxes ─────────────────────────────────────────────────────────

function EventosCheckboxes({
  selected, onChange, disabled,
}: {
  selected: string[]; onChange: (v: string[]) => void; disabled?: boolean;
}) {
  function toggle(id: string) {
    onChange(
      selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {WA_EVENTOS.map(ev => (
        <label
          key={ev.id}
          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
            selected.includes(ev.id)
              ? "border-brand/40 bg-brand/10"
              : "border-white/10 bg-white/5 hover:bg-white/10"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input
            type="checkbox"
            checked={selected.includes(ev.id)}
            onChange={() => toggle(ev.id)}
            disabled={disabled}
            className="h-4 w-4 accent-brand"
          />
          <span className="text-sm text-slate-300">{ev.label}</span>
        </label>
      ))}
    </div>
  );
}

// ── WhatsApp Section ───────────────────────────────────────────────────────────

function WhatsAppSection({
  cfg, onCfgChange, onSaveCreds, savingCreds,
  toast,
}: {
  cfg: EmpresaConfig;
  onCfgChange: (patch: Partial<EmpresaConfig>) => void;
  onSaveCreds: () => Promise<void>;
  savingCreds: boolean;
  toast: ReturnType<typeof useToast>;
}) {
  const [wa, setWa] = useState<WaState>({
    status: "carregando", slug: null, qr: null, pairingCode: null,
  });
  const [acting, setActing] = useState(false);
  const [savingEvts, setSavingEvts] = useState(false);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch("/api/painel/whatsapp/instancia", { headers: authHeader() });
      const data = await res.json();
      if (data.success) setWa(data.data as WaState);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Poll every 15 s when not connected
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (wa.status !== "conectado" && wa.status !== "carregando") {
      intervalRef.current = setInterval(fetchStatus, 15_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [wa.status, fetchStatus]);

  // Auto-refresh QR every 25 s when awaiting
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
        } catch { /* silent */ }
      }, 25_000);
    }
    return () => { if (qrIntervalRef.current) clearInterval(qrIntervalRef.current); };
  }, [wa.status]);

  async function handleCriar() {
    setActing(true);
    try {
      const res  = await fetch("/api/painel/whatsapp/instancia", {
        method: "POST", headers: authHeader(),
      });
      const data = await res.json();
      if (data.success) {
        // Aplica QR imediatamente se a API já retornou (sem aguardar próximo poll)
        const d = data.data as WaState & { existing?: boolean };
        if (d.qr) {
          setWa({ status: "aguardando", slug: d.slug, qr: d.qr, pairingCode: d.pairingCode });
          toast.show("success", d.existing ? "QR code obtido! Escaneie para conectar." : "Instância criada! Escaneie o QR code.");
        } else {
          toast.show("success", "Instância criada! Aguardando QR code...");
          // Poll mais frequente nos próximos 30s
          setWa(prev => ({ ...prev, status: "aguardando" }));
          await fetchStatus();
        }
      } else {
        toast.show("error", data.error ?? "Erro ao criar instância");
      }
    } catch { toast.show("error", "Falha na conexão"); }
    finally { setActing(false); }
  }

  async function handleReconectar() {
    setActing(true);
    try {
      const res  = await fetch("/api/painel/whatsapp/qr", { headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        if (data.data.qr) {
          setWa(prev => ({ ...prev, status: "aguardando", qr: data.data.qr, pairingCode: data.data.pairingCode }));
          toast.show("success", "QR code atualizado. Escaneie para conectar.");
        } else {
          toast.show("error", "Não foi possível obter o QR code agora. Tente em instantes.");
        }
      } else {
        toast.show("error", data.error ?? "Erro ao reconectar");
      }
    } catch { toast.show("error", "Falha na conexão"); }
    finally { setActing(false); }
  }

  async function handleReiniciar() {
    setActing(true);
    try {
      const res  = await fetch("/api/painel/whatsapp/instancia", {
        method: "DELETE", headers: authHeader(),
      });
      const data = await res.json();
      if (data.success) {
        toast.show("success", "Instância removida. Criando nova...");
        setWa({ status: "nao_criada", slug: wa.slug, qr: null, pairingCode: null });
        await handleCriar();
      } else {
        toast.show("error", data.error ?? "Erro ao reiniciar instância");
      }
    } catch { toast.show("error", "Falha na conexão"); }
    finally { setActing(false); }
  }

  async function handleRemover() {
    if (!confirm("Remover a instância do WhatsApp? Isso desconectará o número.")) return;
    setActing(true);
    try {
      const res  = await fetch("/api/painel/whatsapp/instancia", {
        method: "DELETE", headers: authHeader(),
      });
      const data = await res.json();
      if (data.success) {
        toast.show("success", "Instância removida com sucesso.");
        setWa({ status: "nao_criada", slug: wa.slug, qr: null, pairingCode: null });
      } else {
        toast.show("error", data.error ?? "Erro ao remover instância");
      }
    } catch { toast.show("error", "Falha na conexão"); }
    finally { setActing(false); }
  }

  async function handleSaveEvts() {
    setSavingEvts(true);
    try {
      const res  = await fetch("/api/painel/config", {
        method:  "PATCH",
        headers: jsonHeader(),
        body:    JSON.stringify({ evolution_eventos: cfg.evolution_eventos }),
      });
      const data = await res.json();
      if (data.success) toast.show("success", "Eventos salvos.");
      else toast.show("error", data.error ?? "Erro ao salvar eventos");
    } catch { toast.show("error", "Falha na conexão"); }
    finally { setSavingEvts(false); }
  }

  async function handleSaveAndCreate() {
    await onSaveCreds();
    // Give the DB a moment then create instance
    setTimeout(async () => {
      await handleCriar();
    }, 500);
  }

  const notCreated  = wa.status === "nao_criada" && !wa.qr;
  const isConnected = wa.status === "conectado";
  // Mostra QR se status indica aguardando/desconectado OU se temos QR mesmo com outro status
  const showQR      = !!wa.qr && wa.status !== "conectado";
  const hasCredentials = cfg.evolution_url.trim() !== "" && cfg.evolution_key.trim() !== "";

  return (
    <div className="space-y-4">

      {/* ── Credentials form ── */}
      <SectionCard>
        <div className="flex items-start gap-4 mb-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/10">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-brand" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">WhatsApp Business</h3>
            <p className="mt-0.5 text-sm text-slate-400">
              Configure sua instância da Evolution API para este estabelecimento
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="evo-url" className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Link2 className="h-3.5 w-3.5" /> URL da Evolution API
            </label>
            <input
              id="evo-url"
              type="url"
              value={cfg.evolution_url}
              onChange={e => onCfgChange({ evolution_url: e.target.value })}
              placeholder="https://evolution.seudominio.com.br"
              disabled={savingCreds}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/30 disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="evo-key" className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Key className="h-3.5 w-3.5" /> API Key / Token
            </label>
            <PasswordField
              id="evo-key"
              value={cfg.evolution_key}
              onChange={v => onCfgChange({ evolution_key: v })}
              placeholder="••••••••••••••••"
              disabled={savingCreds}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={onSaveCreds}
            disabled={savingCreds || !hasCredentials}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50 transition"
          >
            {savingCreds ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar credenciais
          </button>

          {notCreated && hasCredentials && (
            <button
              onClick={handleSaveAndCreate}
              disabled={acting || savingCreds}
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition"
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Salvar e criar instância
            </button>
          )}
        </div>
      </SectionCard>

      {/* ── Status + action buttons ── */}
      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={wa.status} />
            {wa.slug && (
              <span className="text-xs text-slate-500">
                Instância: <span className="font-mono text-slate-400">{wa.slug}</span>
              </span>
            )}
          </div>

          <div className="flex flex-shrink-0 flex-wrap gap-2">
            {notCreated && hasCredentials && (
              <button
                onClick={handleCriar}
                disabled={acting}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar instância
              </button>
            )}
            {isConnected && (
              <>
                <button
                  onClick={handleReiniciar}
                  disabled={acting}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 disabled:opacity-50 transition"
                >
                  {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Reiniciar instância
                </button>
                <button
                  onClick={handleReconectar}
                  disabled={acting}
                  className="flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/20 disabled:opacity-50 transition"
                >
                  {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                  Reconectar
                </button>
              </>
            )}
            {!notCreated && !isConnected && wa.status !== "carregando" && (
              <button
                onClick={handleReconectar}
                disabled={acting}
                className="flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/20 disabled:opacity-50 transition"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Reconectar
              </button>
            )}
            {!notCreated && (
              <button
                onClick={handleRemover}
                disabled={acting}
                className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir instância
              </button>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── QR Code ── */}
      {showQR && (
        <SectionCard>
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="flex-shrink-0">
              <div className="rounded-2xl bg-white p-3 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={wa.qr!.startsWith("data:") ? wa.qr! : `data:image/png;base64,${wa.qr}`}
                  alt="QR Code WhatsApp"
                  className="h-48 w-48 object-contain"
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">Atualiza a cada 25s</p>
                <button
                  onClick={handleReconectar}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition"
                >
                  <RefreshCw className="h-3 w-3" /> Atualizar agora
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">Como conectar</h4>
                <ol className="space-y-2 text-sm text-slate-400">
                  {[
                    "Abra o WhatsApp no seu celular",
                    "Toque em ⋮ (mais opções) ou Configurações",
                    'Selecione "Dispositivos vinculados"',
                    'Toque em "Vincular um dispositivo"',
                    "Escaneie o QR code ao lado",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-xs font-bold">
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

      {/* ── Connected info ── */}
      {isConnected && (
        <SectionCard>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10">
              <Wifi className="h-5 w-5 text-brand" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">WhatsApp conectado</p>
              <p className="text-xs text-slate-400">
                Seu número está ativo e pronto para automações
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Eventos WhatsApp ── */}
      {!notCreated && (
        <SectionCard>
          <h4 className="text-sm font-semibold text-white mb-1">Eventos WhatsApp</h4>
          <p className="text-xs text-slate-400 mb-4">
            Selecione quais eventos disparam uma mensagem via WhatsApp
          </p>
          <EventosCheckboxes
            selected={cfg.evolution_eventos}
            onChange={v => onCfgChange({ evolution_eventos: v })}
            disabled={savingEvts}
          />
          <div className="mt-4">
            <button
              onClick={handleSaveEvts}
              disabled={savingEvts}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50 transition"
            >
              {savingEvts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar eventos
            </button>
          </div>
        </SectionCard>
      )}

      {/* ── Templates de mensagem ── */}
      {!notCreated && <MensagensTemplatesSection toast={toast} />}
    </div>
  );
}

// ── Mensagens (templates) ──────────────────────────────────────────────────────

interface MensagemTpl {
  evento:      string;
  texto:       string;
  ativo:       boolean;
  customizado: boolean;
}

const TPL_VARS = [
  { tag: "{empresa}",  desc: "Nome da empresa" },
  { tag: "{numero}",   desc: "Número do pedido" },
  { tag: "{cliente}",  desc: "Nome do cliente" },
  { tag: "{total}",    desc: "Total formatado (R$ 0,00)" },
  { tag: "{telefone}", desc: "Telefone do cliente" },
];

function MensagensTemplatesSection({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [templates, setTemplates] = useState<MensagemTpl[]>([]);
  const [loading, setLoading]     = useState(true);
  const [savingEv, setSavingEv]   = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/painel/mensagens-template", { headers: authHeader() });
      const d = await r.json();
      if (d.success) setTemplates(d.data.templates ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const labelByEvento: Record<string, string> = Object.fromEntries(
    WA_EVENTOS.map(e => [e.id, e.label])
  );

  function setLocal(evento: string, patch: Partial<MensagemTpl>) {
    setTemplates(prev => prev.map(t => t.evento === evento ? { ...t, ...patch } : t));
  }

  async function salvar(t: MensagemTpl) {
    setSavingEv(t.evento);
    try {
      const r = await fetch("/api/painel/mensagens-template", {
        method:  "PUT",
        headers: { ...authHeader(), ...jsonHeader() },
        body:    JSON.stringify({ evento: t.evento, texto: t.texto, ativo: t.ativo }),
      });
      const d = await r.json();
      if (d.success) {
        toast.show("success", `Template "${labelByEvento[t.evento] ?? t.evento}" salvo`);
        setLocal(t.evento, { customizado: true });
      } else {
        toast.show("error", d.error?.message ?? "Falha ao salvar");
      }
    } finally { setSavingEv(null); }
  }

  if (loading) {
    return (
      <SectionCard>
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <h4 className="text-sm font-semibold text-white mb-1">Templates de mensagem</h4>
      <p className="text-xs text-slate-400 mb-4">
        Personalize o texto enviado em cada evento. Use as variáveis abaixo.
      </p>

      {/* Variáveis disponíveis */}
      <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Variáveis disponíveis</p>
        <div className="flex flex-wrap gap-1.5">
          {TPL_VARS.map(v => (
            <span key={v.tag} title={v.desc} className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-emerald-300">
              {v.tag}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {templates.map(t => (
          <div key={t.evento} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {labelByEvento[t.evento] ?? t.evento}
                </span>
                {t.customizado && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                    custom
                  </span>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={t.ativo}
                  onChange={e => setLocal(t.evento, { ativo: e.target.checked })}
                  className="h-3.5 w-3.5 accent-emerald-500"
                />
                Ativo
              </label>
            </div>
            <textarea
              value={t.texto}
              onChange={e => setLocal(t.evento, { texto: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white font-mono focus:border-emerald-500/50 focus:outline-none resize-y"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => salvar(t)}
                disabled={savingEv === t.evento}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition"
              >
                {savingEv === t.evento
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Save className="h-3.5 w-3.5" />}
                Salvar
              </button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── N8N Section ────────────────────────────────────────────────────────────────

function N8NSection({
  cfg, onCfgChange, toast,
}: {
  cfg: EmpresaConfig;
  onCfgChange: (patch: Partial<EmpresaConfig>) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [saving, setSaving]         = useState(false);
  const [savingEvts, setSavingEvts] = useState(false);
  const isConfigured = cfg.n8n_url.trim() !== "";

  async function handleSave() {
    setSaving(true);
    try {
      const res  = await fetch("/api/painel/config", {
        method:  "PATCH",
        headers: jsonHeader(),
        body:    JSON.stringify({ n8n_url: cfg.n8n_url, n8n_token: cfg.n8n_token }),
      });
      const data = await res.json();
      if (data.success) toast.show("success", "Configurações do N8N salvas.");
      else toast.show("error", data.error ?? "Erro ao salvar N8N");
    } catch { toast.show("error", "Falha na conexão"); }
    finally { setSaving(false); }
  }

  async function handleSaveEvts() {
    setSavingEvts(true);
    try {
      const res  = await fetch("/api/painel/config", {
        method:  "PATCH",
        headers: jsonHeader(),
        body:    JSON.stringify({ n8n_eventos: cfg.n8n_eventos }),
      });
      const data = await res.json();
      if (data.success) toast.show("success", "Eventos N8N salvos.");
      else toast.show("error", data.error ?? "Erro ao salvar eventos");
    } catch { toast.show("error", "Falha na conexão"); }
    finally { setSavingEvts(false); }
  }

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="flex items-start gap-4 mb-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-orange-500/10">
            <Zap className="h-7 w-7 text-orange-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-base font-semibold text-white">N8N Automações</h3>
              {isConfigured
                ? <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold text-brand">
                    <CheckCircle className="h-3 w-3" /> Configurado
                  </span>
                : <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/15 px-3 py-1 text-xs font-semibold text-slate-400">
                    Não configurado
                  </span>
              }
            </div>
            <p className="mt-0.5 text-sm text-slate-400">
              Configure o webhook do N8N para automações de pedidos e notificações
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="n8n-url" className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Link2 className="h-3.5 w-3.5" /> URL do Webhook N8N
            </label>
            <input
              id="n8n-url"
              type="url"
              value={cfg.n8n_url}
              onChange={e => onCfgChange({ n8n_url: e.target.value })}
              placeholder="https://n8n.seudominio.com.br/webhook/..."
              disabled={saving}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30 disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="n8n-token" className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Key className="h-3.5 w-3.5" /> Token (opcional)
            </label>
            <PasswordField
              id="n8n-token"
              value={cfg.n8n_token}
              onChange={v => onCfgChange({ n8n_token: v })}
              placeholder="Token de autenticação"
              disabled={saving}
            />
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50 transition"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar configurações N8N
          </button>
        </div>
      </SectionCard>

      {isConfigured && (
        <SectionCard>
          <h4 className="text-sm font-semibold text-white mb-1">Eventos N8N</h4>
          <p className="text-xs text-slate-400 mb-4">
            Selecione quais eventos disparam chamadas para o seu webhook N8N
          </p>
          <EventosCheckboxes
            selected={cfg.n8n_eventos}
            onChange={v => onCfgChange({ n8n_eventos: v })}
            disabled={savingEvts}
          />
          <div className="mt-4">
            <button
              onClick={handleSaveEvts}
              disabled={savingEvts}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50 transition"
            >
              {savingEvts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar eventos N8N
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Placeholder card ───────────────────────────────────────────────────────────

function PlaceholderSection({
  name, description, color, initial,
}: {
  name: string; description: string; color: string; initial: string;
}) {
  return (
    <SectionCard>
      <div className="flex items-start gap-4">
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
  const [cfg, setCfg] = useState<EmpresaConfig>({
    evolution_url:    "",
    evolution_key:    "",
    evolution_eventos: [],
    n8n_url:          "",
    n8n_token:        "",
    n8n_eventos:      [],
  });
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [savingCreds, setSavingCreds] = useState(false);
  const toast = useToast();

  // Load current empresa config on mount
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch("/api/painel/config", { headers: authHeader() });
        const data = await res.json();
        if (data.success) {
          const d = data.data as Record<string, unknown>;
          setCfg({
            evolution_url:     (d.evolution_url as string)  ?? "",
            evolution_key:     (d.evolution_key as string)  ?? "",
            evolution_eventos: parseJsonArray(d.evolution_eventos),
            n8n_url:           (d.n8n_url as string)        ?? "",
            n8n_token:         (d.n8n_token as string)      ?? "",
            n8n_eventos:       parseJsonArray(d.n8n_eventos),
          });
        }
      } catch { /* silent */ }
      finally { setLoadingCfg(false); }
    })();
  }, []);

  async function handleSaveCreds() {
    setSavingCreds(true);
    try {
      const res  = await fetch("/api/painel/config", {
        method:  "PATCH",
        headers: jsonHeader(),
        body:    JSON.stringify({
          evolution_url: cfg.evolution_url,
          evolution_key: cfg.evolution_key,
        }),
      });
      const data = await res.json();
      if (data.success) toast.show("success", "Credenciais salvas com sucesso.");
      else toast.show("error", data.error ?? "Erro ao salvar credenciais");
    } catch { toast.show("error", "Falha na conexão"); }
    finally { setSavingCreds(false); }
  }

  if (loadingCfg) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap className="h-6 w-6 text-brand" />
          Integrações
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Conecte sua conta com plataformas externas para automações e pedidos
        </p>
      </div>

      {/* Section 1: WhatsApp */}
      <section className="space-y-3">
        <SectionDivider label="WhatsApp" />
        <WhatsAppSection
          cfg={cfg}
          onCfgChange={patch => setCfg(prev => ({ ...prev, ...patch }))}
          onSaveCreds={handleSaveCreds}
          savingCreds={savingCreds}
          toast={toast}
        />
      </section>

      {/* Section 2: N8N */}
      <section className="space-y-3">
        <SectionDivider label="Automações" />
        <N8NSection
          cfg={cfg}
          onCfgChange={patch => setCfg(prev => ({ ...prev, ...patch }))}
          toast={toast}
        />
      </section>

      {/* Section 3 & 4: Marketplaces */}
      <section className="space-y-3">
        <SectionDivider label="Marketplaces" />
        <div className="grid gap-4 md:grid-cols-2">
          <a href="/painel/ifood" className="block rounded-2xl border border-[#ea1d2c]/30 bg-[#ea1d2c]/5 hover:bg-[#ea1d2c]/10 p-5 transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-lg bg-[#ea1d2c] p-2 text-white font-bold w-9 h-9 flex items-center justify-center">iF</div>
              <h3 className="font-bold text-white">iFood</h3>
              <span className="ml-auto rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">DISPONÍVEL</span>
            </div>
            <p className="text-sm text-slate-400">
              Receba pedidos do iFood direto no painel. Configure suas credenciais e a sincronização é automática.
            </p>
            <p className="mt-3 text-xs text-emerald-400">→ Configurar agora</p>
          </a>
          <PlaceholderSection
            name="Rappi"
            description="Integração com Rappi em breve. Sincronize seu cardápio e pedidos automaticamente."
            color="#ff441f"
            initial="R"
          />
        </div>
      </section>

      {toast.toast && <Toast toast={toast.toast} />}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-px flex-1 bg-white/5" />
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</h2>
      <div className="h-px flex-1 bg-white/5" />
    </div>
  );
}

function parseJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}
