"use client";
import { useRef, useState } from "react";
import { Loader2, X, Camera, Trash2, Check, Barcode } from "lucide-react";
import { notify } from "@/components/Notify";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}

interface Entrada {
  id: string;
  serial: string;
  fabricante: string;
  modelo: string;
  polegadas: string;
  resolucao: string;
  nome: string;
  previewUrl: string;
  lendo?: boolean;
  erro?: string;
}

/** Deduz polegadas a partir do modelo (ex.: LH46UHF5 → 46). */
function parsePolegadas(modelo: string): string {
  const m = (modelo || "").match(/(\d{2,3})/);
  if (m) { const n = Number(m[1]); if (n >= 19 && n <= 110) return String(n); }
  return "";
}

function gerarNome(e: { fabricante: string; modelo: string; serial: string }): string {
  const tail = e.serial ? e.serial.slice(-6) : "";
  return [e.fabricante, e.modelo, tail].map(s => s.trim()).filter(Boolean).join(" ").trim() || "TV";
}

/** Escolhe, entre os códigos lidos, o que mais parece um número de série. */
function escolherSerial(vals: string[]): string | null {
  const cand = vals.map(v => v.trim()).filter(v => /^[A-Za-z0-9-]{6,}$/.test(v));
  if (!cand.length) return null;
  cand.sort((a, b) => b.length - a.length);
  return cand[0];
}

/** Lê o código de barras da imagem. Tenta a API nativa do Chrome e, se não houver, o ZXing via CDN. */
async function lerBarcode(file: File): Promise<string | null> {
  // 1) BarcodeDetector nativo (Chrome)
  try {
    const BD = (window as unknown as { BarcodeDetector?: new (o: unknown) => { detect: (b: unknown) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    if (BD) {
      const det = new BD({ formats: ["code_128", "code_39", "itf", "codabar", "ean_13", "qr_code"] });
      const bmp = await createImageBitmap(file);
      const codes = await det.detect(bmp);
      const best = escolherSerial(codes.map(c => c.rawValue));
      if (best) return best;
    }
  } catch { /* segue pro fallback */ }

  // 2) ZXing via CDN (fallback cross-browser)
  const url = URL.createObjectURL(file);
  try {
    // @ts-expect-error import externo resolvido em runtime (não bundlado)
    const zxing = await import(/* webpackIgnore: true */ "https://esm.sh/@zxing/library@0.21.3");
    const reader = new zxing.BrowserMultiFormatReader();
    const res = await reader.decodeFromImageUrl(url);
    return res?.getText?.() ?? null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CadastroFotoTVs({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [padrao, setPadrao] = useState({ fabricante: "Samsung", modelo: "", polegadas: "", resolucao: "" });
  const [lista, setLista] = useState<Entrada[]>([]);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return;
    for (const file of Array.from(files)) {
      const id = Math.random().toString(36).slice(2);
      const previewUrl = URL.createObjectURL(file);
      const base: Entrada = {
        id, serial: "", fabricante: padrao.fabricante, modelo: padrao.modelo,
        polegadas: padrao.polegadas || parsePolegadas(padrao.modelo), resolucao: padrao.resolucao,
        nome: "", previewUrl, lendo: true,
      };
      setLista(l => [base, ...l]);
      const serial = await lerBarcode(file).catch(() => null);
      setLista(l => l.map(e => e.id === id
        ? { ...e, serial: serial ?? "", lendo: false, nome: gerarNome({ fabricante: e.fabricante, modelo: e.modelo, serial: serial ?? "" }), erro: serial ? undefined : "não li o código — digite o serial" }
        : e));
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function upd(id: string, patch: Partial<Entrada>) {
    setLista(l => l.map(e => {
      if (e.id !== id) return e;
      const n = { ...e, ...patch };
      // auto-deduz polegadas ao mudar modelo (se vazio)
      if (patch.modelo !== undefined && !patch.polegadas && !n.polegadas) n.polegadas = parsePolegadas(n.modelo);
      return n;
    }));
  }

  function remover(id: string) {
    setLista(l => { const e = l.find(x => x.id === id); if (e) URL.revokeObjectURL(e.previewUrl); return l.filter(x => x.id !== id); });
  }

  async function salvarTodas() {
    const validos = lista.filter(e => e.serial.trim() || e.nome.trim());
    if (!validos.length) { notify("Adicione ao menos uma TV com serial.", "error"); return; }
    setSalvando(true);
    const falhas = new Set<string>();
    let ok = 0;
    for (const e of validos) {
      const body = {
        tipo: "tv",
        nome: e.nome.trim() || gerarNome(e),
        serial: e.serial.trim() || undefined,
        fabricante: e.fabricante.trim() || undefined,
        modelo: e.modelo.trim() || undefined,
        polegadas: e.polegadas ? Number(e.polegadas) : undefined,
        resolucao: e.resolucao.trim() || undefined,
      };
      try {
        const r = await aapi(token, "/api/admin/inventario", { method: "POST", body: JSON.stringify(body) }).then(r => r.json());
        if (r.ok) ok++; else { falhas.add(e.id); upd(e.id, { erro: r.error || "erro ao salvar" }); }
      } catch { falhas.add(e.id); upd(e.id, { erro: "falha de rede" }); }
    }
    setSalvando(false);
    notify(`${ok} TV(s) cadastrada(s)${falhas.size ? `, ${falhas.size} com erro` : ""}`, falhas.size ? "error" : "success");
    if (ok > 0) onSaved();
    setLista(l => l.filter(e => falhas.has(e.id)));
    if (falhas.size === 0) onClose();
  }

  const Campo = ({ label, val, onCh, ph, w }: { label: string; val: string; onCh: (v: string) => void; ph?: string; w?: string }) => (
    <label className={`flex flex-col gap-1 ${w ?? ""}`}>
      <span className="text-[11px] text-slate-400">{label}</span>
      <input value={val} onChange={e => onCh(e.target.value)} placeholder={ph}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:border-brand" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold"><Barcode className="h-5 w-5 text-brand" /> Cadastrar TVs por foto</h3>
            <p className="text-xs text-slate-400">Fotografe a etiqueta — o serial vem do código de barras. Marca/modelo/polegadas usam o padrão do lote.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        {/* padrão do lote */}
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-300">Padrão do lote <span className="font-normal text-slate-500">(aplicado às próximas fotos)</span></p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Campo label="Marca" val={padrao.fabricante} onCh={v => setPadrao(p => ({ ...p, fabricante: v }))} ph="Samsung" />
            <Campo label="Modelo" val={padrao.modelo} onCh={v => setPadrao(p => ({ ...p, modelo: v, polegadas: parsePolegadas(v) || p.polegadas }))} ph="LH46UHF5" />
            <Campo label="Polegadas" val={padrao.polegadas} onCh={v => setPadrao(p => ({ ...p, polegadas: v }))} ph="46" />
            <Campo label="Resolução" val={padrao.resolucao} onCh={v => setPadrao(p => ({ ...p, resolucao: v }))} ph="4K / 1080p" />
          </div>
        </div>

        {/* botão foto */}
        <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => onFiles(e.target.files)} />
        <button onClick={() => inputRef.current?.click()}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand/50 bg-brand/10 py-4 text-sm font-semibold text-brand hover:bg-brand/20">
          <Camera className="h-5 w-5" /> Tirar foto / escolher imagens da etiqueta
        </button>

        {/* lista */}
        {lista.length > 0 && (
          <div className="mb-4 space-y-2">
            {lista.map(e => (
              <div key={e.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.previewUrl} alt="etiqueta" className="h-12 w-12 shrink-0 rounded object-cover" />
                <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-5">
                  <label className="col-span-2 flex flex-col gap-0.5 sm:col-span-1">
                    <span className="text-[10px] text-slate-500">Serial {e.lendo && <Loader2 className="inline h-3 w-3 animate-spin" />}</span>
                    <input value={e.serial} onChange={ev => upd(e.id, { serial: ev.target.value })} placeholder={e.lendo ? "lendo…" : "serial"}
                      className={`rounded border bg-white/5 px-2 py-1 text-xs outline-none ${e.erro ? "border-red-500/50" : "border-white/10"}`} />
                  </label>
                  <input value={e.fabricante} onChange={ev => upd(e.id, { fabricante: ev.target.value })} placeholder="marca" className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none" />
                  <input value={e.modelo} onChange={ev => upd(e.id, { modelo: ev.target.value })} placeholder="modelo" className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none" />
                  <input value={e.polegadas} onChange={ev => upd(e.id, { polegadas: ev.target.value })} placeholder="pol." className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none" />
                  <input value={e.nome} onChange={ev => upd(e.id, { nome: ev.target.value })} placeholder="nome" className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none" />
                </div>
                <button onClick={() => remover(e.id)} className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{lista.length} TV(s) na fila</span>
          <button onClick={salvarTodas} disabled={salvando || lista.length === 0}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar todas ({lista.length})
          </button>
        </div>
      </div>
    </div>
  );
}
