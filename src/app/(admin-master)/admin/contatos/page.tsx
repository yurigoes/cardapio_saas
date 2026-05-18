"use client";

/**
 * /admin/contatos
 * Master/suporte vê contatos do site institucional e responde por email.
 */
import { useEffect, useState, useCallback } from "react";
import { Mail, MessageCircle, Phone, Building2, Send, Loader2, Filter, RefreshCw, Check, X } from "lucide-react";
import { alertar } from "@/components/ui/ConfirmModal";

interface Contato {
  id: string; nome: string; email: string; telefone: string | null;
  empresa: string | null; mensagem: string; ip: string;
  status: "novo" | "lido" | "respondido" | "convertido" | "spam";
  respondido_em: string | null;
  resposta_texto: string | null;
  observacoes: string | null;
  created_at: string;
}

const STATUS_CFG: Record<Contato["status"], { label: string; cor: string }> = {
  novo:        { label: "Novo",        cor: "bg-blue-500/20 text-blue-300" },
  lido:        { label: "Lido",        cor: "bg-slate-500/20 text-slate-300" },
  respondido:  { label: "Respondido",  cor: "bg-emerald-500/20 text-emerald-300" },
  convertido:  { label: "Convertido",  cor: "bg-purple-500/20 text-purple-300" },
  spam:        { label: "Spam",        cor: "bg-red-500/20 text-red-300" },
};

export default function ContatosPage() {
  const [list, setList] = useState<Contato[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [aberto, setAberto] = useState<Contato | null>(null);
  const [loading, setLoading] = useState(true);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/contatos${filtroStatus ? `?status=${filtroStatus}` : ""}`,
        { headers: auth() }).then(r => r.json());
      if (r.success) setList(r.data?.contatos ?? r.data ?? []);
    } finally { setLoading(false); }
  }, [filtroStatus]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Contatos do site</h1>
            <p className="text-xs text-slate-400">{list.length} mensagens</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white">
            <option value="">Todos status</option>
            <option value="novo">Novos</option>
            <option value="lido">Lidos</option>
            <option value="respondido">Respondidos</option>
            <option value="convertido">Convertidos</option>
            <option value="spam">Spam</option>
          </select>
          <button onClick={carregar} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center text-slate-500">
          Nenhum contato no filtro atual.
        </div>
      ) : (
        <div className="grid gap-2">
          {list.map(c => {
            const cfg = STATUS_CFG[c.status];
            return (
              <button key={c.id} onClick={() => setAberto(c)}
                className={`text-left rounded-xl border p-4 transition hover:border-emerald-500/30 hover:bg-emerald-500/5 ${
                  c.status === "novo" ? "border-blue-500/30 bg-blue-500/5" : "border-white/10 bg-white/5"
                }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{c.nome}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cfg.cor}`}>{cfg.label}</span>
                      {c.empresa && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Building2 className="h-3 w-3" /> {c.empresa}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {c.email}{c.telefone && ` · ${c.telefone}`}
                    </p>
                    <p className="mt-2 text-sm text-slate-300 line-clamp-2">{c.mensagem}</p>
                  </div>
                  <div className="text-[11px] text-slate-500 text-right flex-shrink-0">
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}<br />
                    {new Date(c.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {aberto && (
        <DetalheContato contato={aberto} onClose={() => setAberto(null)} onUpdate={() => { setAberto(null); carregar(); }} />
      )}
    </div>
  );
}

function DetalheContato({ contato, onClose, onUpdate }: {
  contato: Contato; onClose: () => void; onUpdate: () => void;
}) {
  const [resposta, setResposta] = useState(contato.resposta_texto ?? "");
  const [obs, setObs]           = useState(contato.observacoes ?? "");
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [busy, setBusy] = useState(false);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  async function salvar(novoStatus?: Contato["status"], comResposta = false) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (novoStatus) body.status = novoStatus;
      if (obs !== (contato.observacoes ?? "")) body.observacoes = obs;
      if (comResposta && resposta.trim().length >= 3) {
        body.resposta_texto = resposta;
        body.enviar_email   = enviarEmail;
      }
      const r = await fetch(`/api/admin/contatos/${contato.id}`, {
        method: "PATCH", headers: auth(), body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha");
      if (d.data?.email_enviado) {
        await alertar({ titulo: "Email enviado", tipo: "sucesso" });
      }
      onUpdate();
    } catch (e) {
      await alertar({ titulo: "Falha", mensagem: (e as Error).message, tipo: "perigo" });
    } finally { setBusy(false); }
  }

  const waNumero = contato.telefone?.replace(/\D/g, "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h3 className="text-base font-bold text-white">Detalhes do contato</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Info */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <p className="text-lg font-bold text-white">{contato.nome}</p>
            <div className="flex flex-wrap gap-3 text-xs text-slate-300">
              <a href={`mailto:${contato.email}`} className="flex items-center gap-1 hover:text-emerald-300">
                <Mail className="h-3.5 w-3.5" /> {contato.email}
              </a>
              {contato.telefone && (
                <>
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {contato.telefone}
                  </span>
                  {waNumero && (
                    <a href={`https://wa.me/55${waNumero}`} target="_blank" rel="noopener"
                      className="flex items-center gap-1 text-emerald-300 hover:underline">
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  )}
                </>
              )}
              {contato.empresa && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" /> {contato.empresa}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Recebido em {new Date(contato.created_at).toLocaleString("pt-BR")} · IP {contato.ip}
            </p>
          </div>

          {/* Mensagem */}
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Mensagem</p>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 whitespace-pre-wrap">
              {contato.mensagem}
            </div>
          </div>

          {/* Resposta */}
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Resposta</p>
            <textarea value={resposta} onChange={e => setResposta(e.target.value)}
              rows={5} placeholder="Escreva sua resposta..."
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={enviarEmail} onChange={e => setEnviarEmail(e.target.checked)} />
              Enviar resposta por email pra {contato.email}
            </label>
          </div>

          {/* Observações internas */}
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Observações internas</p>
            <textarea value={obs} onChange={e => setObs(e.target.value)}
              rows={2} placeholder="Notas internas (não vão pro cliente)"
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/10 px-5 py-3">
          <button onClick={() => salvar("convertido")} disabled={busy}
            className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-300 hover:bg-purple-500/20">
            Marcar convertido
          </button>
          <button onClick={() => salvar("spam")} disabled={busy}
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20">
            Spam
          </button>
          <button onClick={() => salvar("lido")} disabled={busy}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
            Marcar lido
          </button>
          <div className="flex-1" />
          <button onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-300 hover:bg-white/5">
            Fechar
          </button>
          <button onClick={() => salvar("respondido", true)} disabled={busy || resposta.trim().length < 3}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar resposta
          </button>
        </div>
      </div>
    </div>
  );
}
