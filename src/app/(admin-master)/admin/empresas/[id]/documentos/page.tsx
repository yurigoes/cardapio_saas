"use client";

/**
 * /admin/empresas/[id]/documentos
 * Master/suporte revisa anexos cadastrais da empresa e aprova/rejeita.
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, X, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { alertar } from "@/components/ui/ConfirmModal";

interface Doc {
  id: string;
  tipo: string;
  nome_arquivo: string;
  url: string;
  tamanho: number;
  mime: string;
  status: "pendente" | "aprovado" | "rejeitado";
  validado: boolean;
  validado_em: string | null;
  observacao: string | null;
  created_at: string;
}

const TIPO_LABELS: Record<string, string> = {
  cnpj:                  "CNPJ / Cartão CNPJ",
  identidade_frente:     "Identidade (frente)",
  identidade_verso:      "Identidade (verso)",
  selfie_com_documento:  "Selfie segurando documento",
  contrato_social:       "Contrato social",
  comprovante_endereco:  "Comprovante de endereço",
  outro:                 "Outro",
};

export default function DocsEmpresaPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejeitando, setRejeitando] = useState<Doc | null>(null);
  const [motivo, setMotivo] = useState("");

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/admin/empresas/${id}/documentos`, { headers: auth() }).then(r => r.json());
    if (r.success) setDocs(r.data ?? []);
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function setStatus(doc: Doc, status: Doc["status"], obs?: string) {
    // Rejeição: abre modal pra motivo (não usa prompt nativo)
    if (status === "rejeitado" && !obs) {
      setRejeitando(doc);
      setMotivo("");
      return;
    }
    setBusy(doc.id);
    try {
      const r = await fetch(`/api/admin/empresas/${id}/documentos`, {
        method: "PATCH", headers: auth(),
        body: JSON.stringify({ doc_id: doc.id, status, observacao: obs }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha");
      setRejeitando(null);
      setMotivo("");
      carregar();
    } catch (e) {
      await alertar({ titulo: "Falha", mensagem: (e as Error).message, tipo: "perigo" });
    } finally { setBusy(null); }
  }

  async function confirmarRejeicao() {
    if (!rejeitando) return;
    if (motivo.trim().length < 3) {
      await alertar({ titulo: "Motivo obrigatório", mensagem: "Informe pelo menos 3 caracteres explicando o motivo.", tipo: "alerta" });
      return;
    }
    await setStatus(rejeitando, "rejeitado", motivo.trim());
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/admin/empresas/${id}/editar`)}
          className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-white">Documentos cadastrais</h1>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
          Nenhum documento enviado ainda.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {docs.map(d => {
            const isImg = d.mime.startsWith("image/");
            return (
              <div
                key={d.id}
                className={`rounded-xl border p-4 ${
                  d.status === "aprovado"  ? "border-emerald-500/30 bg-emerald-500/5" :
                  d.status === "rejeitado" ? "border-red-500/40 bg-red-500/10" :
                                              "border-amber-500/20 bg-amber-500/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      {TIPO_LABELS[d.tipo] ?? d.tipo}
                    </p>
                    <p className="text-sm text-white truncate">{d.nome_arquivo}</p>
                    <p className="text-[11px] text-slate-500">
                      {(d.tamanho/1024).toFixed(0)}KB · {new Date(d.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  {d.status === "aprovado" && (
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">✓ APROVADO</span>
                  )}
                  {d.status === "rejeitado" && (
                    <span className="rounded bg-red-500/30 px-2 py-0.5 text-[10px] font-bold text-red-200">✗ REJEITADO</span>
                  )}
                  {d.status === "pendente" && (
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">⏳ PENDENTE</span>
                  )}
                </div>

                <a href={d.url} target="_blank" rel="noopener" className="block mb-3">
                  {isImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.url} alt={d.nome_arquivo} className="w-full h-48 object-cover rounded-lg border border-white/10" />
                  ) : (
                    <div className="flex items-center justify-center h-48 rounded-lg border border-white/10 bg-black/30">
                      <FileText className="h-12 w-12 text-slate-600" />
                    </div>
                  )}
                </a>

                {d.observacao && (
                  <p className="mb-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">
                    💬 {d.observacao}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setStatus(d, "aprovado")}
                    disabled={busy === d.id || d.status === "aprovado"}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40"
                  >
                    {busy === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                      <><Check className="h-3.5 w-3.5" /> Aprovar</>}
                  </button>
                  <button
                    onClick={() => setStatus(d, "rejeitado")}
                    disabled={busy === d.id || d.status === "rejeitado"}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" /> Rejeitar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal motivo da rejeição */}
      {rejeitando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
             onClick={() => { setRejeitando(null); setMotivo(""); }}>
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-slate-900 shadow-2xl"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <h3 className="flex items-center gap-2 text-base font-bold text-white">
                <X className="h-5 w-5 text-red-400" />
                Rejeitar documento
              </h3>
              <button onClick={() => { setRejeitando(null); setMotivo(""); }}
                className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-300">
                <strong className="text-white">{TIPO_LABELS[rejeitando.tipo] ?? rejeitando.tipo}</strong>
                <br />
                <span className="text-xs text-slate-500">{rejeitando.nome_arquivo}</span>
              </p>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Motivo da rejeição
                </label>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  autoFocus
                  rows={4}
                  placeholder="Ex: Foto borrada, documento ilegível, CPF não confere com cadastro..."
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-red-500/50 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Esse motivo vai aparecer pro cliente reenviar o documento correto.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setRejeitando(null); setMotivo(""); }}
                  className="flex-1 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
                  Cancelar
                </button>
                <button
                  onClick={confirmarRejeicao}
                  disabled={busy !== null || motivo.trim().length < 3}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  Confirmar rejeição
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
