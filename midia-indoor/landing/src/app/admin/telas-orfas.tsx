"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, MonitorPlay, Link2, RefreshCw, Plus, X } from "lucide-react";
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
  const [novaTv, setNovaTv] = useState(false);

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
        <div className="flex gap-2">
          <button onClick={() => setNovaTv(true)} className="flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">
            <Plus className="h-4 w-4" /> Adicionar TV manualmente
          </button>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
          </button>
        </div>
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

      {novaTv && <AdicionarTvManualModal token={token} locais={locais} onClose={() => setNovaTv(false)} onSaved={() => { setNovaTv(false); load(); }} />}

      <div className="mt-6 rounded-xl border border-brand/30 bg-brand/5 p-3 text-xs text-slate-300">
        <p className="mb-1 font-semibold text-brand-light">💡 Fluxo recomendado pra TV nova</p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>Cria o local no SaaS (Locais → Novo local, define orientação/dimensões)</li>
          <li>Liga a TV box e roda no PC: <code className="rounded bg-black/40 px-1.5 py-0.5">.\provisiona.ps1 -Ip 192.168.X.X</code></li>
          <li>O APK instala, app abre com CMS já configurado, TV se registra sozinha</li>
          <li>Vem aqui nesta aba, escolhe o local no dropdown e clica <strong>Vincular</strong></li>
          <li>Em 1-2min a TV começa a tocar o conteúdo do local</li>
        </ol>
        <p className="mt-2 text-amber-300">Se a TV nao apareceu automaticamente (ex: provisionada offline), use <strong>Adicionar TV manualmente</strong> no topo.</p>
      </div>
    </div>
  );
}

function AdicionarTvManualModal({ token, locais, onClose, onSaved }: { token: string; locais: LocalSimples[]; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [mac, setMac] = useState("");
  const [serial, setSerial] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [modelo, setModelo] = useState("");
  const [localId, setLocalId] = useState("");
  const [rustdeskId, setRustdeskId] = useState("");
  const [rustdeskSenha, setRustdeskSenha] = useState("td2026");
  const [monitorModelo, setMonitorModelo] = useState("");
  const [monitorPolegadas, setMonitorPolegadas] = useState("");
  const [ip, setIp] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function salvar() {
    if (!nome) { setErr("Nome é obrigatório"); return; }
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/inventario", { method: "POST", body: JSON.stringify({
      tipo: "tv",
      nome,
      mac: mac || undefined,
      serial: serial || undefined,
      fabricante: fabricante || undefined,
      modelo: modelo || undefined,
      local_id: localId || undefined,
      observacao: obs || undefined,
      monitor_modelo: monitorModelo || undefined,
      monitor_polegadas: monitorPolegadas ? Number(monitorPolegadas) : undefined,
    })});
    const d = await r.json();
    if (!d.ok) { setBusy(false); setErr(d.error || "Erro ao criar item"); return; }
    // Se passou rustdesk_id, atualiza tambem via endpoint de provisionamento
    if (rustdeskId && mac) {
      await fetch("/api/admin/inventario/rustdesk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: "td-provision-2026",
          mac: mac.toUpperCase(),
          rustdesk_id: rustdeskId,
          rustdesk_senha: rustdeskSenha,
          nome, ip: ip || undefined,
        }),
      }).catch(() => {});
    }
    setBusy(false);
    notify(`TV "${nome}" adicionada ao inventario · QR: ${d.qr_token}`, "success");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#12121c] p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Adicionar TV manualmente</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">Use quando a TV ainda nao se registrou sozinha no Xibo (ex: provisionada offline) ou pra cadastrar TVs antigas no inventário.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <CampoTV label="Nome / identificacao *" value={nome} set={setNome} placeholder="ex: TD-LOJA-01" />
          <CampoTV label="MAC do TV box" value={mac} set={v => setMac(v.toUpperCase())} placeholder="AA:BB:CC:DD:EE:FF" mono />
          <CampoTV label="Serial do TV box" value={serial} set={setSerial} mono />
          <CampoTV label="Fabricante" value={fabricante} set={setFabricante} placeholder="ex: Rockchip" />
          <CampoTV label="Modelo" value={modelo} set={setModelo} placeholder="ex: RK3229 BOX" />
          <CampoTV label="IP local" value={ip} set={setIp} placeholder="192.168.X.X" mono />
          <CampoTV label="RustDesk ID" value={rustdeskId} set={setRustdeskId} placeholder="1680527765" mono />
          <CampoTV label="RustDesk senha" value={rustdeskSenha} set={setRustdeskSenha} placeholder="td2026" />
          <CampoTV label="Monitor / TV conectado" value={monitorModelo} set={setMonitorModelo} placeholder="ex: Samsung 43 UN43J5290" />
          <CampoTV label="Polegadas" value={monitorPolegadas} set={setMonitorPolegadas} placeholder="43" type="number" />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs text-slate-400">Local (opcional - pode vincular depois)</label>
          <select value={localId} onChange={e => setLocalId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
            <option value="">— sem local —</option>
            {locais.map(l => <option key={l.id} value={l.id}>{l.nome}{l.cidade ? ` · ${l.cidade}` : ""}</option>)}
          </select>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs text-slate-400">Observação</label>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
        </div>
        {err && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
        <button onClick={salvar} disabled={busy || !nome} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold hover:bg-brand-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Adicionar TV
        </button>
      </div>
    </div>
  );
}

function CampoTV({ label, value, set, placeholder = "", type = "text", mono }: { label: string; value: string; set: (v: string) => void; placeholder?: string; type?: string; mono?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <input type={type} value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
        className={`w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50 ${mono ? "font-mono" : ""}`} />
    </div>
  );
}
