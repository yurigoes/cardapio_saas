/**
 * /admin/etiquetas?ids=uuid1,uuid2,...  ou  ?all=1
 *
 * Pagina printable (A4) com varias etiquetas 90x60mm.
 * Layout: 2 colunas x 4 linhas = 8 etiquetas por pagina A4.
 * Usuario imprime/salva como PDF pelo navegador (Ctrl+P).
 *
 * Acessada autenticada via token no localStorage do admin (transferido via query string).
 */
"use client";

import { useEffect, useState, Suspense } from "react";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";

interface ItemInv {
  id: string; tipo: string; nome: string; mac: string | null; serial: string | null;
  fabricante: string | null; modelo: string | null; qr_token: string;
}

function qrImgUrl(data: string, sizePx = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${sizePx}x${sizePx}&data=${encodeURIComponent(data)}&format=png&margin=2`;
}

export default function EtiquetasMassaPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>}>
      <EtiquetasMassa />
    </Suspense>
  );
}

function EtiquetasMassa() {
  const params = useSearchParams();
  const router = useRouter();
  const [itens, setItens] = useState<ItemInv[]>([]);
  const [loading, setLoading] = useState(true);
  const [origem, setOrigem] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigem(window.location.origin);
    const token = typeof window !== "undefined" ? localStorage.getItem("midia_admin_token") : null;
    if (!token) { setLoading(false); return; }

    const idsParam = params.get("ids");
    const all = params.get("all") === "1";

    fetch("/api/admin/inventario", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setLoading(false); return; }
        let lista: ItemInv[] = d.itens ?? [];
        if (!all && idsParam) {
          const idsSet = new Set(idsParam.split(","));
          lista = lista.filter(i => idsSet.has(i.id));
        }
        setItens(lista);
        setLoading(false);
      });
  }, [params]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-white"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Barra de ações (esconde na impressão) */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm print:hidden">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="text-sm text-slate-600">
          <strong>{itens.length}</strong> {itens.length === 1 ? "etiqueta" : "etiquetas"} ·
          {" "}{Math.ceil(itens.length / 8)} pág{Math.ceil(itens.length / 8) > 1 ? "s" : ""} A4
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
          <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
        </button>
      </div>

      {/* Folhas A4 */}
      <div className="mx-auto py-6 print:py-0">
        {chunks(itens, 8).map((pagina, pi) => (
          <div key={pi} className="folha-a4 mx-auto mb-6 grid grid-cols-2 gap-[3mm] bg-white p-[8mm] shadow-md print:mb-0 print:shadow-none">
            {pagina.map(it => (
              <div key={it.id} className="etiqueta">
                <div className="info">
                  <p className="marca">THREE DIGITAL · INVENTÁRIO</p>
                  <h1>{it.nome}</h1>
                  <p><b>{it.tipo.toUpperCase()}</b> · <code>{it.qr_token}</code></p>
                  {it.mac && <p>MAC: <code>{it.mac}</code></p>}
                  {it.serial && <p>SN: <code>{it.serial}</code></p>}
                  {it.modelo && <p>{(it.fabricante ?? "") + " " + it.modelo}</p>}
                  <p className="escaneie">↗ Escaneie pra detalhes</p>
                </div>
                <div className="qr">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrImgUrl(`${origem}/q/${it.qr_token}`, 240)} alt={`QR ${it.qr_token}`} />
                </div>
              </div>
            ))}
            {/* Preenche slots vazios pra manter grid */}
            {Array.from({ length: 8 - pagina.length }).map((_, i) => <div key={`e${i}`} className="etiqueta-vazia" />)}
          </div>
        ))}

        {itens.length === 0 && (
          <div className="mx-auto mt-20 max-w-md rounded-2xl bg-white p-10 text-center shadow-md">
            <p className="text-lg font-semibold text-slate-800">Nenhuma etiqueta para imprimir</p>
            <p className="mt-2 text-sm text-slate-500">Adicione itens ao inventário antes de gerar etiquetas em massa.</p>
          </div>
        )}
      </div>

      <style jsx global>{`
        @page { size: A4 portrait; margin: 0; }
        body { background: #f1f5f9; }
        @media print { body { background: white; } .folha-a4 { page-break-after: always; break-after: page; } .folha-a4:last-child { page-break-after: auto; } }

        .folha-a4 {
          width: 210mm;
          min-height: 297mm;
          box-sizing: border-box;
        }
        .etiqueta {
          width: 95mm;
          height: 65mm;
          padding: 5mm;
          display: flex;
          gap: 4mm;
          align-items: center;
          border: 1px dashed #cbd5e1;
          box-sizing: border-box;
          background: white;
          color: #1a1a2e;
          font-family: -apple-system, system-ui, sans-serif;
        }
        @media print { .etiqueta { border: 1px dashed transparent; } }
        .etiqueta-vazia { height: 65mm; }
        .etiqueta .info { flex: 1; min-width: 0; }
        .etiqueta .info .marca { font-size: 6pt; letter-spacing: 1.2pt; color: #888; margin: 0 0 2mm 0; font-weight: 600; }
        .etiqueta .info h1 { margin: 0 0 1.5mm 0; font-size: 13pt; color: #7c3aed; font-weight: 800; line-height: 1.1; word-wrap: break-word; }
        .etiqueta .info p { margin: 0.8mm 0; font-size: 8pt; color: #333; line-height: 1.2; }
        .etiqueta .info code { font-family: ui-monospace, monospace; font-size: 7.5pt; background: #f0f0f0; padding: 0.5mm 1mm; border-radius: 1pt; }
        .etiqueta .info .escaneie { font-size: 6pt; color: #999; margin-top: 2mm; }
        .etiqueta .qr { width: 32mm; height: 32mm; flex-shrink: 0; }
        .etiqueta .qr img { width: 100%; height: 100%; display: block; }
      `}</style>
    </div>
  );
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
