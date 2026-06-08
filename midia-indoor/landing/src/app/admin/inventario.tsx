"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Plus, X, QrCode, Trash2, Printer, RefreshCw, Monitor, Copy } from "lucide-react";
import { notify, confirmModal } from "@/components/Notify";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}

interface ItemInv {
  id: string; tipo: string; nome: string; mac: string | null; serial: string | null;
  fabricante: string | null; modelo: string | null; local_id: string | null; local_nome: string | null;
  xibo_display_id: number | null; qr_token: string; ip_local: string | null;
  valor: string | null; nota_fiscal: string | null; observacao: string | null; ativo: boolean;
  rustdesk_id: string | null; rustdesk_senha: string | null;
}
interface LocalSimples { id: string; nome: string; cidade?: string | null; }

declare global { interface Window { QRCode?: { toCanvas: (canvas: HTMLCanvasElement, text: string, opts: object, cb: (err?: Error) => void) => void } } }
let _qrLoaded = false;
async function carregarQRCode(): Promise<void> {
  if (_qrLoaded || typeof window === "undefined") return;
  if (window.QRCode) { _qrLoaded = true; return; }
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("falha QRCode"));
    document.head.appendChild(s);
  });
  _qrLoaded = true;
}

export function Inventario({ token }: { token: string }) {
  const [itens, setItens] = useState<ItemInv[]>([]);
  const [locais, setLocais] = useState<LocalSimples[]>([]);
  const [novo, setNovo] = useState(false);
  const [verQR, setVerQR] = useState<ItemInv | null>(null);
  const [filtro, setFiltro] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      aapi(token, "/api/admin/inventario").then(r => r.json()),
      aapi(token, "/api/admin/locais").then(r => r.json()),
    ]);
    if (r1.ok) setItens(r1.itens);
    if (r2.ok) setLocais(r2.locais);
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const filtrados = itens.filter(i => !filtro || (i.nome + " " + (i.mac ?? "") + " " + (i.serial ?? "") + " " + (i.local_nome ?? "") + " " + i.qr_token).toLowerCase().includes(filtro.toLowerCase()));

  async function excluir(item: ItemInv) {
    if (!await confirmModal(`Excluir "${item.nome}" do inventário?`)) return;
    await aapi(token, `/api/admin/inventario?id=${item.id}`, { method: "DELETE" });
    notify("Item excluído", "success");
    load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">📦 Inventário ({itens.length})</h2>
          <p className="text-xs text-slate-400">Controle de equipamentos: TVs, boxes, totens, cabos, suportes. Cada item gera um QR code pra colar fisicamente.</p>
        </div>
        <div className="flex gap-2">
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar nome / MAC / serial..." className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none" />
          <button onClick={load} disabled={loading} className="rounded-lg border border-white/15 p-1.5 hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo item</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400">
            <tr><th className="p-3">Tipo</th><th className="p-3">Nome</th><th className="p-3">MAC</th><th className="p-3">Serial</th><th className="p-3">Local</th><th className="p-3">Xibo</th><th className="p-3">RustDesk</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {filtrados.map(i => (
              <tr key={i.id} className={`border-t border-white/5 ${!i.ativo ? "opacity-50" : ""}`}>
                <td className="p-3 text-xs uppercase">{i.tipo}</td>
                <td className="p-3"><div className="font-medium">{i.nome}</div><div className="text-[10px] font-mono text-slate-500">{i.qr_token}</div></td>
                <td className="p-3 font-mono text-xs">{i.mac ?? "—"}</td>
                <td className="p-3 font-mono text-xs">{i.serial ?? "—"}</td>
                <td className="p-3 text-xs">{i.local_nome ?? "—"}</td>
                <td className="p-3 text-xs">{i.xibo_display_id ? `#${i.xibo_display_id}` : "—"}</td>
                <td className="p-3 text-xs font-mono">{i.rustdesk_id ?? "—"}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-1">
                    {i.rustdesk_id && <RemotoBtn id={i.rustdesk_id} senha={i.rustdesk_senha} />}
                    <button onClick={() => setVerQR(i)} className="rounded border border-brand/40 p-1.5 text-brand-light hover:bg-brand/10" title="QR Code"><QrCode className="h-3.5 w-3.5" /></button>
                    <button onClick={() => excluir(i)} className="rounded border border-red-500/30 p-1.5 text-red-300 hover:bg-red-500/10" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtrados.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">Nenhum item.</td></tr>}
          </tbody>
        </table>
      </div>

      {novo && <NovoItemModal token={token} locais={locais} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
      {verQR && <QRCodeModal item={verQR} onClose={() => setVerQR(null)} />}
    </div>
  );
}

function NovoItemModal({ token, locais, onClose, onSaved }: { token: string; locais: LocalSimples[]; onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState("box");
  const [nome, setNome] = useState("");
  const [mac, setMac] = useState("");
  const [serial, setSerial] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [modelo, setModelo] = useState("");
  const [localId, setLocalId] = useState("");
  const [valor, setValor] = useState("");
  const [nf, setNf] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/inventario", { method: "POST", body: JSON.stringify({
      tipo, nome, mac: mac || undefined, serial: serial || undefined, fabricante: fabricante || undefined,
      modelo: modelo || undefined, local_id: localId || undefined, valor: valor ? Number(valor) : undefined,
      nota_fiscal: nf || undefined, observacao: obs || undefined,
    })});
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    notify(`Item criado · QR: ${d.qr_token}`, "success");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#12121c] p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="font-bold">Novo item no inventário</h3><button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
              <option value="box">📦 Android Box</option>
              <option value="tv">📺 TV / Monitor</option>
              <option value="totem">🗼 Totem</option>
              <option value="cabo">🔌 Cabo HDMI</option>
              <option value="fonte">⚡ Fonte</option>
              <option value="suporte">🔩 Suporte / Bracket</option>
              <option value="outro">📎 Outro</option>
            </select>
          </div>
          <Field label="Nome" value={nome} onChange={setNome} placeholder="ex: Box-001 Atacadão" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="MAC Address" value={mac} onChange={v => setMac(v.toUpperCase())} placeholder="AA:BB:CC:DD:EE:FF" mono />
          <Field label="Número de série" value={serial} onChange={setSerial} mono />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fabricante" value={fabricante} onChange={setFabricante} placeholder="ex: Xiaomi" />
          <Field label="Modelo" value={modelo} onChange={setModelo} placeholder="ex: Mi Box S" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Local (opcional)</label>
          <select value={localId} onChange={e => setLocalId(e.target.value)} className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
            <option value="">— estoque (sem local) —</option>
            {locais.map(l => <option key={l.id} value={l.id}>{l.nome}{l.cidade ? ` · ${l.cidade}` : ""}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)" value={valor} onChange={setValor} type="number" />
          <Field label="Nota fiscal" value={nf} onChange={setNf} placeholder="000123" />
        </div>
        <Field label="Observação" value={obs} onChange={setObs} />
        {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
        <button onClick={salvar} disabled={busy || !nome} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Adicionar ao inventário
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder = "", type = "text", mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none ${mono ? "font-mono" : ""}`} />
    </div>
  );
}

function RemotoBtn({ id, senha }: { id: string; senha: string | null }) {
  function abrir() {
    // RustDesk schema: rustdesk://connection/new/connect?id=XXXX&password=YYYY
    // No Windows com client instalado, abre direto. Senao mostra modal.
    const url = `rustdesk://connection/new/connect?id=${id}${senha ? `&password=${encodeURIComponent(senha)}` : ""}`;
    window.location.href = url;
  }
  function copiar() {
    navigator.clipboard.writeText(id);
    notify(`ID ${id} copiado`, "success");
  }
  return (
    <>
      <button onClick={abrir} className="rounded border border-emerald-500/40 p-1.5 text-emerald-300 hover:bg-emerald-500/10" title={`Acessar via RustDesk (ID ${id}${senha ? `, senha ${senha}` : ""})`}>
        <Monitor className="h-3.5 w-3.5" />
      </button>
      <button onClick={copiar} className="rounded border border-slate-500/40 p-1.5 text-slate-300 hover:bg-slate-500/10" title="Copiar ID RustDesk">
        <Copy className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

function QRCodeModal({ item, onClose }: { item: ItemInv; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [origem, setOrigem] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigem(window.location.origin);
    (async () => {
      await carregarQRCode();
      if (canvasRef.current && window.QRCode) {
        const url = `${window.location.origin}/q/${item.qr_token}`;
        window.QRCode.toCanvas(canvasRef.current, url, { width: 300, margin: 2 }, (err) => {
          if (err) console.error(err);
        });
      }
    })();
  }, [item.qr_token]);

  function imprimir() {
    const url = `${origem}/q/${item.qr_token}`;
    const html = `
      <html><head><title>${item.nome} - QR</title>
      <style>
        body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; }
        .etiqueta { width: 90mm; height: 60mm; border: 1px solid #ddd; padding: 10mm; display: flex; gap: 5mm; align-items: center; box-sizing: border-box; page-break-after: always; }
        .info { flex: 1; }
        .info h1 { margin: 0; font-size: 14pt; color: #7c3aed; }
        .info p { margin: 3px 0; font-size: 9pt; color: #333; }
        .qr-area { width: 30mm; height: 30mm; }
        .qr-area canvas { width: 100%; height: 100%; }
        @media print { .etiqueta { border: none; } body { padding: 0; } }
      </style></head>
      <body>
        <div class="etiqueta">
          <div class="info">
            <p style="font-size:7pt;letter-spacing:1px;color:#888;margin:0">THREE DIGITAL · INVENTÁRIO</p>
            <h1>${item.nome}</h1>
            <p><b>${item.tipo.toUpperCase()}</b> · ID: <code>${item.qr_token}</code></p>
            ${item.mac ? `<p>MAC: <code>${item.mac}</code></p>` : ""}
            ${item.serial ? `<p>Serial: <code>${item.serial}</code></p>` : ""}
            ${item.modelo ? `<p>${item.fabricante ?? ""} ${item.modelo}</p>` : ""}
            <p style="font-size:7pt;color:#999;margin-top:8mm">Escaneie pra ver detalhes</p>
          </div>
          <div class="qr-area"><canvas id="qr"></canvas></div>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
        <script>
          window.QRCode.toCanvas(document.getElementById('qr'), '${url}', { width: 113, margin: 0 }, () => {
            setTimeout(() => window.print(), 300);
          });
        </script>
      </body></html>`;
    const w = window.open("", "_blank", "width=600,height=500");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12121c] p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="font-bold">QR · {item.nome}</h3><button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div>
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl bg-white p-3">
            <canvas ref={canvasRef} />
          </div>
          <p className="text-center text-xs text-slate-400">URL: <code className="text-brand-light">{origem}/q/{item.qr_token}</code></p>
          <button onClick={imprimir} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark">
            <Printer className="h-4 w-4" /> Imprimir etiqueta (90×60mm)
          </button>
          <p className="text-center text-[10px] text-slate-500">Cole a etiqueta impressa no equipamento. Ao escanear, abre a página de detalhes pra técnicos.</p>
        </div>
      </div>
    </div>
  );
}
