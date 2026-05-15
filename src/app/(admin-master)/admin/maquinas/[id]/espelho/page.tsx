"use client";

/**
 * /admin/maquinas/[id]/espelho — Master vê em real-time a tela do kiosk/TV.
 *
 * Faz polling de 3s no /api/admin/agentes/[id]/last-frame que devolve PNG
 * direto. Cache-bust via timestamp na URL.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Maximize2, RefreshCw, Tv2, AlertCircle } from "lucide-react";

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

interface Meta {
  nome:           string;
  ultimo_frame_em: string | null;
  tem_frame:      boolean;
  w:              number | null;
  h:              number | null;
}

function tempoAtras(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "agora";
  const s = Math.floor(ms / 1000); if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);    if (m < 60) return `${m}min atrás`;
  return `${Math.floor(m / 60)}h atrás`;
}

export default function EspelhoPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [tick, setTick] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  async function loadMeta() {
    try {
      const r = await fetch(`/api/admin/agentes/${params.id}/last-frame?meta=1`, {
        headers: authHeaders(), cache: "no-store",
      });
      const d = await r.json();
      if (d.success) {
        setMeta(d.data);
        setErro(null);
      } else {
        setErro(d.error ?? "Erro");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  useEffect(() => {
    loadMeta();
    const t = setInterval(() => {
      loadMeta();
      setTick(x => x + 1);
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  function fullscreen() {
    document.documentElement.requestFullscreen?.();
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/admin/maquinas")}
            className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">Espelho — {meta?.nome ?? "..."}</h1>
            <p className="text-xs text-slate-400">
              Última captura: {tempoAtras(meta?.ultimo_frame_em ?? null)}
              {meta?.w && meta?.h && ` · ${meta.w}×${meta.h}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { loadMeta(); setTick(x => x + 1); }}
            className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={fullscreen}
            className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5"
            title="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {erro && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle className="h-4 w-4" /> {erro}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black flex items-center justify-center min-h-[500px]">
        {meta?.tem_frame ? (
          <img
            src={`/api/admin/agentes/${params.id}/last-frame?t=${tick}`}
            alt="Espelho do kiosk"
            className="max-w-full max-h-[80vh] object-contain"
          />
        ) : (
          <div className="text-center p-8">
            <Tv2 className="mx-auto h-16 w-16 text-slate-700" />
            <p className="mt-4 text-sm font-medium text-slate-400">Aguardando primeiro frame...</p>
            <p className="mt-1 text-xs text-slate-600">
              O kiosk envia screenshots a cada 8 segundos.<br/>
              Verifique se o agente está montado em <code>&lt;KioskMirror /&gt;</code> na página kiosk e tem token registrado.
            </p>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-600">
        Auto-refresh a cada 3s · Captura no kiosk a cada 8s · Sem consentimento adicional (display público).
      </p>
    </div>
  );
}
