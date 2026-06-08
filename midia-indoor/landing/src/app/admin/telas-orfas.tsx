"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, MonitorPlay, Link2, RefreshCw } from "lucide-react";
import { notify } from "@/components/Notify";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}

interface Orfa { displayId: number; nome: string; hardwareKey: string; online: boolean; autorizado: boolean; lastAccessed: number | null; clientAddress: string; }
interface LocalSimples { id: string; nome: string; cidade?: string | null; }

export function TelasOrfas({ token }: { token: string }) {
  const [orfas, setOrfas] = useState<Orfa[]>([]);
  const [locais, setLocais] = useState<LocalSimples[]>([]);
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        aapi(token, "/api/admin/telas-orfas").then(r => r.json()),
        aapi(token, "/api/admin/locais").then(r => r.json()),
      ]);
      if (r1.ok) setOrfas(r1.telas_orfas);
      if (r2.ok) setLocais(r2.locais);
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  async function vincular(displayId: number) {
    const localId = escolhas[displayId];
    if (!localId) { notify("Escolha um local", "error"); return; }
    setBusy(displayId);
    const r = await aapi(token, "/api/admin/displays", {
      method: "POST",
      body: JSON.stringify({ acao: "vincular", displayId, local_id: localId }),
    });
    const d = await r.json(); setBusy(null);
    if (d.ok) {
      notify("TV vinculada ao local — conteúdo deve chegar em 1-2min", "success");
      load();
    } else notify(d.error || "Erro", "error");
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><MonitorPlay className="h-5 w-5" /> TVs aguardando vinculação ({orfas.length})</h2>
          <p className="text-xs text-slate-400">Telas registradas no Xibo que ainda não foram associadas a nenhum local do SaaS. Geralmente são TVs recém-instaladas.</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
        </button>
      </div>

      {orfas.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-slate-500">
          🎉 Nenhuma TV órfã — todas as telas registradas estão vinculadas a um local.
        </div>
      ) : (
        <div className="space-y-2">
          {orfas.map(d => (
            <div key={d.displayId} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${d.online ? "bg-emerald-400" : "bg-slate-500"}`}></span>
                    <span className="font-medium">{d.nome}</span>
                    <span className="text-xs text-slate-500">#{d.displayId}</span>
                    {!d.autorizado && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-300">NÃO AUTORIZADA</span>}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {d.clientAddress && <span>IP: {d.clientAddress} · </span>}
                    HW: <span className="font-mono">{d.hardwareKey?.slice(0, 16)}…</span>
                    {d.lastAccessed && <span> · visto {new Date(d.lastAccessed * 1000).toLocaleString("pt-BR")}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select value={escolhas[d.displayId] ?? ""} onChange={e => setEscolhas(s => ({ ...s, [d.displayId]: e.target.value }))} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none">
                    <option value="">— escolha o local —</option>
                    {locais.map(l => <option key={l.id} value={l.id}>{l.nome}{l.cidade ? ` · ${l.cidade}` : ""}</option>)}
                  </select>
                  <button onClick={() => vincular(d.displayId)} disabled={!escolhas[d.displayId] || busy === d.displayId} className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50">
                    {busy === d.displayId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Vincular
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-brand/30 bg-brand/5 p-3 text-xs text-slate-300">
        <p className="mb-1 font-semibold text-brand-light">💡 Fluxo recomendado pra TV nova</p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>Cria o local no SaaS (Locais → Novo local, define orientação/dimensões)</li>
          <li>Liga a TV box e roda no PC: <code className="rounded bg-black/40 px-1.5 py-0.5">.\setup-tv.ps1 -ip 192.168.X.X</code></li>
          <li>O APK instala, app abre com CMS já configurado, TV se registra sozinha</li>
          <li>Vem aqui nesta aba, escolhe o local no dropdown e clica <strong>Vincular</strong></li>
          <li>Em 1-2min a TV começa a tocar o conteúdo do local</li>
        </ol>
      </div>
    </div>
  );
}
