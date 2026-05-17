"use client";

/**
 * /admin/integracoes/evolution — Master gerencia Evolution global
 *
 * - Configura URL + api_key + instância default
 * - Lista instâncias existentes (proxy à Evolution API)
 * - Cria/deleta instância
 * - Mostra QR pra conectar
 * - Botão testar envio
 */
import { useEffect, useState, useCallback } from "react";
import { Zap, RefreshCw, Plus, Trash2, Check, X, Loader2, Send, Save, QrCode } from "lucide-react";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";

interface Cfg {
  ativo: boolean;
  url: string | null;
  api_key: string | null;
  instance_name: string | null;
  numero_remetente: string | null;
  ultimo_teste_em: string | null;
  ultimo_teste_ok: boolean | null;
  ultimo_teste_msg: string | null;
}

// Evolution API tem 3+ formatos dependendo da versão.
// Aceita todos via 'unknown' + helpers de extração.
type Instance = Record<string, unknown>;

function extractName(i: Instance): string {
  const inst = i.instance as Record<string, unknown> | undefined;
  return String(
    inst?.instanceName ??
    inst?.name ??
    i.instanceName ??
    i.name ??
    i.id ??
    "(sem nome)"
  );
}

function extractStatus(i: Instance): string {
  const inst = i.instance as Record<string, unknown> | undefined;
  const s = String(
    inst?.status ??
    inst?.state ??
    inst?.connectionStatus ??
    i.status ??
    i.state ??
    i.connectionStatus ??
    "?"
  ).toLowerCase();
  return s;
}

function extractProfile(i: Instance): string | null {
  const inst = i.instance as Record<string, unknown> | undefined;
  const owner = inst?.owner ?? inst?.ownerJid ?? i.owner ?? i.ownerJid;
  const profile = inst?.profileName ?? inst?.profilePictureUrl ?? i.profileName;
  if (profile) return String(profile);
  if (owner) return String(owner).split("@")[0];
  return null;
}

function isConectado(status: string): boolean {
  return ["open", "connected", "online"].includes(status.toLowerCase());
}

function authH(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function EvolutionMasterPage() {
  const [cfg, setCfg]       = useState<Cfg | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading]     = useState(true);
  const [salvando, setSalvando]   = useState(false);

  // Modal QR
  const [qrModal, setQrModal] = useState<{ name: string; qr: string | null } | null>(null);

  // Modal teste envio
  const [modalTeste, setModalTeste] = useState(false);
  const [testePara, setTestePara]   = useState("");
  const [testeMsg, setTesteMsg]     = useState("");
  const [enviandoTeste, setEnv]     = useState(false);

  // Modal nova instância
  const [novaInstName, setNovaInstName] = useState("");
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/evolution/master", { headers: authH(), cache: "no-store" });
      const d = await r.json();
      if (d.success) setCfg(d.data);
    } finally { setLoading(false); }
  }, []);

  const carregarInstances = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/evolution/instances", { headers: authH(), cache: "no-store" });
      const d = await r.json();
      if (d.success) {
        const raw = d.data.instances;
        // Evolution pode devolver array OU { instances: [...] } OU { data: [...] }
        const list = Array.isArray(raw)        ? raw :
                     Array.isArray(raw?.instances) ? raw.instances :
                     Array.isArray(raw?.data)   ? raw.data :
                     [];
        setInstances(list);
      }
    } catch {/* */}
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (cfg?.url) carregarInstances(); }, [cfg?.url, carregarInstances]);

  async function salvar() {
    if (!cfg) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/admin/evolution/master", {
        method: "PUT",
        headers: { ...authH(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ativo: cfg.ativo,
          url: cfg.url,
          api_key: cfg.api_key === "********" ? undefined : cfg.api_key,
          instance_name: cfg.instance_name,
          numero_remetente: cfg.numero_remetente,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      await alertar({ titulo: "Salvo", mensagem: "Configuração master Evolution salva", tipo: "sucesso" });
      carregar();
    } catch (e) {
      await alertar({ titulo: "Erro", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    } finally { setSalvando(false); }
  }

  async function testarEnvio() {
    if (!testePara) return;
    setEnv(true);
    try {
      const r = await fetch("/api/admin/evolution/master/testar", {
        method: "POST",
        headers: { ...authH(), "Content-Type": "application/json" },
        body: JSON.stringify({ para: testePara, mensagem: testeMsg || undefined }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      await alertar({ titulo: "Enviado", mensagem: `Mensagem enviada para ${d.data.para}`, tipo: "sucesso" });
      setModalTeste(false); setTestePara(""); setTesteMsg("");
      carregar();
    } catch (e) {
      await alertar({ titulo: "Falha no envio", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    } finally { setEnv(false); }
  }

  async function criarInstance() {
    if (!novaInstName) return;
    setCriando(true);
    try {
      const r = await fetch("/api/admin/evolution/instances", {
        method: "POST",
        headers: { ...authH(), "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName: novaInstName }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      // Pega QR da resposta de criação OU busca via connect
      let qr = extractQr(d);
      if (!qr) {
        // Tenta connect pra forçar gerar QR
        const r2 = await fetch(`/api/admin/evolution/instances/${novaInstName}`, { headers: authH() });
        const d2 = await r2.json();
        qr = extractQr(d2);
      }
      setQrModal({ name: novaInstName, qr });
      setNovaInstName("");
      carregarInstances();
    } catch (e) {
      await alertar({ titulo: "Erro", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    } finally { setCriando(false); }
  }

  function extractQr(d: unknown): string | null {
    // Evolution retorna QR em vários formatos:
    // d.data.base64, d.data.qrcode.base64, d.data.qrcode (string), d.data.code
    if (!d || typeof d !== "object") return null;
    const root = (d as { data?: unknown }).data ?? d;
    if (!root || typeof root !== "object") return null;
    const r = root as Record<string, unknown>;

    if (typeof r.base64 === "string") return r.base64;
    if (typeof r.code   === "string" && r.code.startsWith("data:")) return r.code;
    const qrField = r.qrcode;
    if (typeof qrField === "string") return qrField;
    if (qrField && typeof qrField === "object") {
      const q = qrField as Record<string, unknown>;
      if (typeof q.base64 === "string") return q.base64;
      if (typeof q.code   === "string") return q.code;
    }
    return null;
  }

  async function abrirQR(name: string) {
    setQrModal({ name, qr: null });
    try {
      const r = await fetch(`/api/admin/evolution/instances/${name}`, { headers: authH() });
      const d = await r.json();
      if (!r.ok || !d.success) {
        throw new Error(d?.error || "Não foi possível buscar QR");
      }
      const qr = extractQr(d);
      if (!qr) {
        await alertar({
          titulo: "QR não disponível",
          mensagem: "Evolution não retornou QR code. Instância já pode estar conectada — atualize a lista.",
          tipo: "alerta",
        });
        setQrModal(null);
        carregarInstances();
        return;
      }
      setQrModal({ name, qr });
    } catch (e) {
      setQrModal(null);
      await alertar({ titulo: "Erro buscando QR", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    }
  }

  async function deletarInstance(name: string) {
    const ok = await confirmar({
      titulo: "Deletar instância",
      mensagem: `Deletar "${name}"? Vai desconectar o WhatsApp.`,
      perigo: true,
    });
    if (!ok) return;
    await fetch(`/api/admin/evolution/instances/${name}`, { method: "DELETE", headers: authH() });
    carregarInstances();
  }

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-emerald-400 mx-auto mt-12" />;
  if (!cfg) return <div>Erro ao carregar</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <Zap className="h-5 w-5 text-emerald-400" /> Evolution (Master)
        </h1>
        <p className="text-sm text-slate-400">
          Configuração WhatsApp do <strong>SaaS</strong> (Three Digital), separada das empresas.
          Usado pra: 2FA do suporte, alertas internos, reenvio de credenciais.
        </p>
      </header>

      {/* Status do último teste */}
      {cfg.ultimo_teste_em && (
        <div className={`rounded-xl border p-3 text-xs ${
          cfg.ultimo_teste_ok
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            : "border-red-500/30 bg-red-500/10 text-red-200"
        }`}>
          {cfg.ultimo_teste_ok ? "✓" : "✖"} Último teste em {new Date(cfg.ultimo_teste_em).toLocaleString("pt-BR")}: {cfg.ultimo_teste_msg}
        </div>
      )}

      {/* Config */}
      <div className="rounded-xl border border-white/10 bg-slate-900 p-4 space-y-3">
        <h2 className="text-sm font-bold text-white mb-2">Configuração</h2>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={cfg.ativo}
            onChange={e => setCfg({ ...cfg, ativo: e.target.checked })}
            className="h-4 w-4 accent-emerald-500" />
          <span className="text-sm text-white">Ativo</span>
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">URL Evolution</label>
          <input value={cfg.url ?? ""} onChange={e => setCfg({ ...cfg, url: e.target.value })}
            placeholder="https://evolution.tthreedigital.com.br"
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">API Key (apikey global da Evolution)</label>
          <input type="password" value={cfg.api_key ?? ""} onChange={e => setCfg({ ...cfg, api_key: e.target.value })}
            placeholder={cfg.api_key === "********" ? "(já configurada — digite pra trocar)" : ""}
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm font-mono text-white" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Instância padrão</label>
            <input value={cfg.instance_name ?? ""} onChange={e => setCfg({ ...cfg, instance_name: e.target.value })}
              placeholder="master, suporte-tt, etc"
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Número remetente (info)</label>
            <input value={cfg.numero_remetente ?? ""} onChange={e => setCfg({ ...cfg, numero_remetente: e.target.value })}
              placeholder="+55 11 99999-9999"
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={salvar} disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
          <button onClick={() => setModalTeste(true)} disabled={!cfg.url || !cfg.instance_name}
            className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-300 hover:bg-blue-500/20 disabled:opacity-50">
            <Send className="h-4 w-4" /> Testar envio
          </button>
        </div>
      </div>

      {/* Instâncias na Evolution */}
      <div className="rounded-xl border border-white/10 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Instâncias na Evolution</h2>
          <button onClick={carregarInstances}
            className="rounded p-1 text-slate-400 hover:bg-white/5">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Criar nova */}
        <div className="flex gap-2">
          <input value={novaInstName} onChange={e => setNovaInstName(e.target.value)}
            placeholder="Nome da nova instância"
            className="flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
          <button onClick={criarInstance} disabled={criando || novaInstName.length < 2}
            className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
            {criando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Criar + QR
          </button>
        </div>

        {/* Lista */}
        {instances.length === 0 ? (
          <p className="text-xs text-slate-500 py-3 text-center">Sem instâncias ou Evolution offline</p>
        ) : (
          <div className="space-y-1">
            {instances.map((i, idx) => {
              const name    = extractName(i);
              const status  = extractStatus(i);
              const profile = extractProfile(i);
              const conectado = isConectado(status);
              const statusLabel = status === "?" ? "desconhecido" :
                                  conectado ? "conectado" :
                                  status === "connecting" ? "conectando" :
                                  status === "close" || status === "closed" ? "desconectado" :
                                  status;
              return (
                <div key={idx} className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950 p-2.5">
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                    conectado ? "bg-emerald-500" :
                    status === "connecting" ? "bg-blue-500 animate-pulse" :
                    "bg-amber-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{name}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {statusLabel} {profile && `· ${profile}`}
                    </p>
                  </div>
                  {!conectado && (
                    <button onClick={() => abrirQR(name)}
                      className="flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-500/20 flex-shrink-0">
                      <QrCode className="h-3 w-3" /> QR
                    </button>
                  )}
                  <button onClick={() => deletarInstance(name)}
                    className="rounded border border-red-500/30 bg-red-500/10 p-1 text-red-300 hover:bg-red-500/20 flex-shrink-0">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal QR */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setQrModal(null); }}>
          <div className="w-full max-w-sm rounded-2xl border border-blue-500/30 bg-slate-900 p-6 text-center">
            <div className="mb-2 flex items-start justify-between">
              <h3 className="text-base font-bold text-white">QR — {qrModal.name}</h3>
              <button onClick={() => setQrModal(null)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">Escaneie com o WhatsApp do número que vai conectar</p>
            {qrModal.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrModal.qr.startsWith("data:") ? qrModal.qr : `data:image/png;base64,${qrModal.qr}`}
                alt="QR" className="mx-auto rounded-lg bg-white p-2 max-w-full" />
            ) : (
              <div className="py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto" />
                <p className="text-xs text-slate-500 mt-2">Aguardando QR...</p>
              </div>
            )}
            <button onClick={() => { setQrModal(null); carregarInstances(); }}
              className="mt-4 w-full rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
              Fechar (refresh lista)
            </button>
          </div>
        </div>
      )}

      {/* Modal teste envio */}
      {modalTeste && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalTeste(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-blue-500/30 bg-slate-900 p-6">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-base font-bold text-white">Testar envio WhatsApp</h3>
              <button onClick={() => setModalTeste(false)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-1 block text-xs font-medium text-slate-400">Telefone (com DDD)</label>
            <input value={testePara} onChange={e => setTestePara(e.target.value)}
              placeholder="11999999999"
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />

            <label className="mb-1 block text-xs font-medium text-slate-400">Mensagem (vazio = padrão)</label>
            <textarea value={testeMsg} onChange={e => setTesteMsg(e.target.value)} rows={4}
              placeholder="Mensagem de teste"
              className="mb-4 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white resize-none" />

            <div className="flex gap-2">
              <button onClick={() => setModalTeste(false)} disabled={enviandoTeste}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
                Cancelar
              </button>
              <button onClick={testarEnvio} disabled={enviandoTeste || !testePara}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50">
                {enviandoTeste ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
