"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, LogOut, Smartphone, Check, AlertTriangle, MessageCircle, Send, History } from "lucide-react";
import { notify, confirmModal } from "@/components/Notify";
import { PageHeader, GhostBtn, PremiumTable, THead, TRow, StatusBadge, EmptyState } from "@/components/Premium";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
}

type Estado = "open" | "connecting" | "close" | "qr" | "unknown" | string;
type SetupResp = {
  ok?: boolean;
  estado?: Estado;
  qrcode?: string | null;
  instancia?: string;
  publico?: string | null;
  error?: string;
};

export function WhatsApp({ token }: { token: string }) {
  const [data, setData] = useState<SetupResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await aapi(token, "/api/admin/whatsapp/setup").then(r => r.json());
      setData(r);
      setErro(r?.ok === false ? (r?.error ?? "erro") : null);
    } catch (e: any) {
      setErro(e?.message ?? "falha de rede");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    carregar();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [carregar]);

  useEffect(() => {
    if (!data) return;
    if (data.estado === "open") return;
    timerRef.current = setTimeout(carregar, 5000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [data, carregar]);

  async function desconectar() {
    const ok = await confirmModal("Desconectar WhatsApp? Vai precisar escanear o QR de novo.");
    if (!ok) return;
    setCarregando(true);
    const r = await aapi(token, "/api/admin/whatsapp/setup", { method: "DELETE" }).then(r => r.json());
    if (r?.ok) notify("Desconectado", "success");
    else notify(r?.error ?? "erro", "error");
    await carregar();
  }

  const estado = data?.estado ?? "unknown";
  const conectado = estado === "open";
  const qrBase64 = data?.qrcode ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessageCircle}
        title="WhatsApp"
        subtitle="Pareamento e envio de notificacoes via Evolution API"
        actions={
          <>
            <GhostBtn onClick={carregar} icon={RefreshCw}>Atualizar</GhostBtn>
            {conectado && <GhostBtn onClick={desconectar} icon={LogOut}>Desconectar</GhostBtn>}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Status</p>
              <p className="mt-1 text-lg font-bold">
                {conectado ? (
                  <span className="text-emerald-300 inline-flex items-center gap-2"><Check className="h-5 w-5" /> Conectado</span>
                ) : estado === "connecting" || estado === "qr" ? (
                  <span className="text-amber-300 inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Aguardando QR</span>
                ) : estado === "close" ? (
                  <span className="text-red-300 inline-flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Desconectado</span>
                ) : (
                  <span className="text-slate-400">{estado}</span>
                )}
              </p>
            </div>
            <Smartphone className="h-10 w-10 text-slate-600" />
          </div>
          <div className="space-y-2 text-xs text-slate-400">
            <div className="flex justify-between border-t border-white/5 pt-2">
              <span>Instância</span>
              <span className="font-mono text-slate-200">{data?.instancia ?? "—"}</span>
            </div>
            {data?.publico && (
              <div className="flex justify-between">
                <span>Painel</span>
                <a href={data.publico} target="_blank" rel="noopener" className="font-mono text-brand-light hover:underline">{data.publico}</a>
              </div>
            )}
          </div>
          {erro && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <p className="font-semibold">Erro:</p>
              <p>{erro}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          {conectado ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="rounded-full bg-emerald-500/10 p-4">
                <Check className="h-12 w-12 text-emerald-300" />
              </div>
              <p className="mt-3 font-bold">WhatsApp pareado</p>
              <p className="mt-1 text-xs text-slate-400">As notificacoes serao enviadas automaticamente.</p>
            </div>
          ) : qrBase64 ? (
            <div className="flex flex-col items-center">
              <p className="mb-2 text-sm font-semibold">Escaneie com o WhatsApp</p>
              <p className="mb-3 text-xs text-slate-400">
                Abra WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                alt="QR pareamento WhatsApp"
                className="h-64 w-64 rounded-lg border-4 border-white bg-white"
              />
              <p className="mt-3 text-[11px] text-slate-500">Atualizando automaticamente a cada 5s...</p>
            </div>
          ) : carregando ? (
            <div className="flex h-full items-center justify-center text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-400">
              <AlertTriangle className="h-8 w-8 text-amber-300" />
              <p className="mt-2">QR não disponível agora.</p>
              <p className="text-xs">Tente atualizar ou verifique se a Evolution API está no ar.</p>
            </div>
          )}
        </div>
      </div>

      <WhatsAppLogs token={token} />
    </div>
  );
}

type LogRow = {
  id: string;
  conta_id: string | null;
  conta_nome: string | null;
  empresa: string | null;
  telefone: string;
  tipo: string;
  status: string;
  erro: string | null;
  mensagem: string | null;
  criado_em: string;
};

function corStatus(s: string): "emerald" | "red" | "slate" {
  if (s === "enviado") return "emerald";
  if (s === "falha") return "red";
  return "slate";
}

function WhatsAppLogs({ token }: { token: string }) {
  const [filtro, setFiltro] = useState<"todos" | "enviado" | "falha">("todos");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await aapi(token, `/api/admin/whatsapp-logs?status=${filtro}&limit=100`).then(r => r.json());
      setRows(r?.logs ?? []);
    } finally {
      setCarregando(false);
    }
  }, [token, filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Últimos envios</h3>
        </div>
        <div className="flex gap-2">
          {(["todos", "enviado", "falha"] as const).map(s => (
            <button key={s} onClick={() => setFiltro(s)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                filtro === s ? "bg-brand text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"
              }`}>
              {s}
            </button>
          ))}
          <GhostBtn onClick={carregar} icon={RefreshCw}>Atualizar</GhostBtn>
        </div>
      </div>
      {carregando ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Send} title="Nenhum envio" description="Os logs aparecerao aqui quando as notificacoes forem disparadas." />
      ) : (
        <PremiumTable>
          <THead cols={["Quando", "Conta", "Telefone", "Tipo", "Status", "Detalhe"]} />
          <tbody>
            {rows.map(r => (
              <TRow key={r.id}>
                <td className="px-3 py-2 text-xs text-slate-400">{new Date(r.criado_em).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2 text-xs">{r.conta_nome ?? r.empresa ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.telefone}</td>
                <td className="px-3 py-2 text-xs">{r.tipo}</td>
                <td className="px-3 py-2">
                  <StatusBadge label={r.status} color={corStatus(r.status)} dot />
                </td>
                <td className="px-3 py-2 text-xs text-slate-400 max-w-xs truncate" title={r.erro ?? r.mensagem ?? ""}>
                  {r.erro ?? r.mensagem?.slice(0, 60) ?? "—"}
                </td>
              </TRow>
            ))}
          </tbody>
        </PremiumTable>
      )}
    </div>
  );
}
