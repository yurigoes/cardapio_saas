"use client";

/**
 * /painel/suporte/chamados/[id] — Conversa do chamado.
 * Funciona pra master (vê todos) e empresa (vê só o seu).
 * Polling 5s. Editor de mensagem fixo no rodapé.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Send, Loader2, AlertCircle, Lock, Clock, Mail, ShieldCheck, X, BadgeCheck, MessageCircle, Paperclip, FileText } from "lucide-react";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";

interface Anexo { url: string; nome: string; mime: string; tamanho: number; }
interface Mensagem {
  id: string;
  autor_id: string | null;
  autor_tipo: "cliente" | "agente" | "sistema";
  autor_nome: string;
  texto: string;
  anexos: Anexo[];
  interno: boolean;
  criado_em: string;
}

interface Template {
  id: string; tipo: "email" | "whatsapp"; nome: string;
  assunto: string | null; conteudo: string; variaveis: string[];
}

interface Chamado {
  id:           string;
  assunto:      string;
  status:       string;
  prioridade:   string;
  empresa_nome: string;
  criado_em:    string;
  fechado_em:   string | null;
  admin_validado:   boolean;
  usuario_validado: boolean;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function formatHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ChamadoPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const [chamado, setChamado]     = useState<Chamado | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [erro, setErro]           = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [texto, setTexto]         = useState("");
  const [enviando, setEnviando]   = useState(false);
  const [interno, setInterno]     = useState(false);
  const [isMaster, setIsMaster]   = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Modais
  const [modalEmail, setModalEmail]   = useState(false);
  const [emailPara, setEmailPara]     = useState("");
  const [emailAss, setEmailAss]       = useState("");
  const [emailHtml, setEmailHtml]     = useState("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  const [modalVal, setModalVal]       = useState(false);
  const [modalWA, setModalWA]         = useState(false);
  const [waMensagem, setWaMensagem]   = useState("");
  const [waTelefone, setWaTelefone]   = useState("");
  const [enviandoWA, setEnviandoWA]   = useState(false);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);

  // Anexos
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Carrega templates ao montar
  useEffect(() => {
    fetch("/api/admin/suporte/templates", { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (d.success) setTemplates(d.data.templates ?? []); })
      .catch(() => {});
  }, []);

  // Paste handler global na página: Ctrl+V cola imagem
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = Array.from(e.clipboardData.items);
      const imgItem = items.find(it => it.type.startsWith("image/"));
      if (!imgItem) return;
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (!file) return;
      uploadFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line
  }, [params.id]);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}/anexos`, {
        method:  "POST",
        headers: authHeaders(),
        body:    fd,
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Upload falhou");
      carregar();
    } catch (e) {
      await alertar({ titulo: "Erro upload", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    } finally { setUploading(false); }
  }

  function aplicarTemplate(t: Template, alvo: "email" | "whatsapp") {
    if (alvo === "email") {
      setEmailAss(t.assunto ?? "");
      setEmailHtml(t.conteudo);
    } else {
      setWaMensagem(t.conteudo);
    }
  }
  const [valTipo, setValTipo]         = useState<"admin" | "usuario" | "ambos">("ambos");
  const [solicitandoVal, setSolVal]   = useState(false);

  const [codigo, setCodigo]           = useState("");
  const [codigoTipo, setCodigoTipo]   = useState<"admin" | "usuario">("usuario");

  // Modal de código (substituído inline pelo modal estilizado)
  const [modalCodigo, setModalCodigo] = useState<{
    pendentes: Array<{ tipo: string; expira_em: string }>;
    expirados: Array<{ tipo: string }>;
  } | null>(null);
  const [reenviando, setReenviando]   = useState(false);

  async function abrirModalCodigo() {
    // Busca pendentes atuais antes de abrir
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}/validacao`, { headers: authHeaders() });
      const d = await r.json();
      if (d.success) {
        setModalCodigo({
          pendentes: d.data.pendentes_ativas ?? [],
          expirados: d.data.pendentes_expiradas ?? [],
        });
        // Se há pendente, escolhe tipo automaticamente
        const ativos = d.data.pendentes_ativas ?? [];
        if (ativos.length > 0) setCodigoTipo(ativos[0].tipo as "admin" | "usuario");
      }
    } catch {/* */}
  }

  async function reenviarCodigos(tipo: "admin" | "usuario" | "ambos") {
    setReenviando(true);
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}/validacao`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ tipo, reenviar: true }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      const falhas = d.data.resumo.filter((x: { status: string }) => x.status === "falha");
      if (falhas.length > 0) {
        await alertar({ titulo: "Falhas no reenvio",
          mensagem: falhas.map((f: { tipo: string; erro: string }) => `${f.tipo}: ${f.erro}`).join("\n"),
          tipo: "perigo" });
      } else {
        await alertar({ titulo: "Reenviado", mensagem: "Códigos enviados via WhatsApp", tipo: "sucesso" });
      }
      abrirModalCodigo();
    } catch (e) {
      await alertar({ titulo: "Erro", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    } finally { setReenviando(false); }
  }

  // Detecta role: master ou suporte = agente
  useEffect(() => {
    fetch("/api/auth/me", { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        const role = d?.data?.usuario?.role;
        setIsMaster(role === "master" || role === "suporte");
      })
      .catch(() => {});
  }, []);

  async function enviarEmail() {
    if (!emailPara || !emailAss || !emailHtml) return;
    setEnviandoEmail(true);
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}/email`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ para: emailPara, assunto: emailAss, html: emailHtml }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      setModalEmail(false);
      setEmailPara(""); setEmailAss(""); setEmailHtml("");
      carregar();
    } catch (e) {
      await alertar({ titulo: "Erro", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    } finally { setEnviandoEmail(false); }
  }

  async function enviarWhatsApp() {
    const ok = await confirmar({
      titulo: "Disparar WhatsApp",
      mensagem: `Enviar mensagem pra ${waTelefone || "telefone do usuário"}?`,
      okLabel: "Enviar",
    });
    if (!ok) return;
    setEnviandoWA(true);
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}/whatsapp`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({
          telefone: waTelefone || undefined,
          mensagem: waMensagem || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      setModalWA(false);
      setWaMensagem(""); setWaTelefone("");
      carregar();
    } catch (e) {
      await alertar({ titulo: "Erro", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    } finally { setEnviandoWA(false); }
  }

  async function solicitarValidacao() {
    setSolVal(true);
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}/validacao`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ tipo: valTipo, reenviar: false }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      const resumo = d.data.resumo as Array<{ tipo: string; status: string; erro?: string }>;
      const fail = resumo.filter(x => x.status === "falha");
      if (fail.length > 0) {
        await alertar({
          titulo: "Algumas falharam",
          mensagem: fail.map(f => `${f.tipo}: ${f.erro ?? "?"}`).join("\n"),
          tipo: "perigo",
        });
      }
      setModalVal(false);
      // Sempre abre modal de código (mostra pendentes ativos OU recém-enviados)
      abrirModalCodigo();
      carregar();
    } catch (e) {
      await alertar({ titulo: "Erro", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    } finally { setSolVal(false); }
  }

  async function confirmarCodigo() {
    if (codigo.length < 4) { await alertar({ titulo: "Código inválido", mensagem: "Deve ter 4-6 dígitos", tipo: "alerta" }); return; }
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}/validacao`, {
        method:  "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ tipo: codigoTipo, codigo }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Inválido");
      setCodigo("");
      setModalCodigo(null);
      await alertar({ titulo: "Validado ✓", mensagem: "Código confirmado com sucesso", tipo: "sucesso" });
      carregar();
    } catch (e) {
      await alertar({ titulo: "Erro", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    }
  }

  async function carregar() {
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}`, {
        headers: authHeaders(), cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setErro(d?.error ?? "Erro ao carregar");
        setLoading(false);
        return;
      }
      setChamado(d.data.chamado);
      setMensagens(d.data.mensagens ?? []);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 5_000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  // Auto-scroll pra última mensagem
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mensagens.length]);

  async function enviar() {
    if (texto.trim().length < 1) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}/mensagens`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ texto, interno }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      setTexto("");
      setInterno(false);
      carregar();
    } catch (e) {
      await alertar({ titulo: "Erro", mensagem: e instanceof Error ? e.message : "Erro", tipo: "perigo" });
    } finally { setEnviando(false); }
  }

  async function alterarStatus(novoStatus: string) {
    const ok = await confirmar({
      titulo: "Alterar status",
      mensagem: `Mudar status para "${novoStatus}"?`,
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/painel/suporte/chamados/${params.id}`, {
        method:  "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ status: novoStatus }),
      });
      if (r.ok) carregar();
    } catch {/* */}
  }

  if (loading) {
    return <div className="flex h-96 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
    </div>;
  }

  if (erro || !chamado) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mb-3" />
        <h1 className="text-lg font-bold text-white">{erro ?? "Chamado não encontrado"}</h1>
        <button onClick={() => router.push("/painel/suporte")}
          className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
          Voltar
        </button>
      </div>
    );
  }

  const podeEnviar = chamado.status !== "fechado";

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] -m-6 md:-m-8">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900 px-6 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded p-1 text-slate-400 hover:bg-white/5">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-white truncate">{chamado.assunto}</h1>
          <p className="text-[10px] text-slate-500">
            {chamado.empresa_nome} · #{chamado.id.slice(0, 8)} · aberto {formatHora(chamado.criado_em)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* Selos de validação */}
          {chamado.admin_validado && chamado.usuario_validado ? (
            <span title="Dupla autenticação (admin + usuário)" className="flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              <BadgeCheck className="h-3 w-3" /> 2FA
            </span>
          ) : chamado.admin_validado ? (
            <span title="Validado pelo admin" className="flex items-center gap-1 rounded bg-blue-500/20 border border-blue-500/40 px-2 py-0.5 text-[10px] font-bold text-blue-300">
              <BadgeCheck className="h-3 w-3" /> Admin
            </span>
          ) : chamado.usuario_validado ? (
            <span title="Validado pelo usuário" className="flex items-center gap-1 rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
              <BadgeCheck className="h-3 w-3" /> Usuário
            </span>
          ) : null}

          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
            chamado.status === "aberto"             ? "bg-emerald-500/20 text-emerald-300" :
            chamado.status === "em_andamento"       ? "bg-blue-500/20 text-blue-300" :
            chamado.status === "aguardando_cliente" ? "bg-amber-500/20 text-amber-300" :
            chamado.status === "resolvido"          ? "bg-purple-500/20 text-purple-300" :
                                                      "bg-slate-700 text-slate-400"
          }`}>{chamado.status.replace("_", " ")}</span>
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
            chamado.prioridade === "urgente" ? "bg-red-500/20 text-red-300" :
            chamado.prioridade === "alta"    ? "bg-amber-500/20 text-amber-300" :
                                              "bg-slate-700 text-slate-400"
          }`}>{chamado.prioridade}</span>
        </div>
      </header>

      {/* Master/suporte tem botões de status + ações */}
      {isMaster && podeEnviar && (
        <div className="border-b border-white/10 bg-slate-950/50 px-6 py-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Status:</span>
          {["em_andamento", "aguardando_cliente", "resolvido", "fechado"].map(s =>
            chamado.status !== s && (
              <button key={s} onClick={() => alterarStatus(s)}
                className="rounded border border-white/10 px-2 py-0.5 text-slate-300 hover:bg-white/5">
                {s.replace("_", " ")}
              </button>
            )
          )}
          <span className="ml-auto flex gap-1">
            <button onClick={() => setModalEmail(true)}
              className="flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-blue-300 hover:bg-blue-500/20">
              <Mail className="h-3 w-3" /> Email
            </button>
            <button onClick={() => setModalWA(true)}
              className="flex items-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-green-300 hover:bg-green-500/20">
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </button>
            <button onClick={async () => {
                // Se já há pendentes ativos: abre modal de código (não modal de solicitar)
                const r = await fetch(`/api/painel/suporte/chamados/${params.id}/validacao`, { headers: authHeaders() });
                const d = await r.json();
                if (d.success && (d.data.pendentes_ativas ?? []).length > 0) {
                  abrirModalCodigo();
                } else {
                  setModalVal(true);
                }
              }}
              className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300 hover:bg-emerald-500/20">
              <ShieldCheck className="h-3 w-3" /> 2FA
            </button>
          </span>
        </div>
      )}

      {/* Cliente: barra discreta se há códigos pendentes */}
      {!isMaster && podeEnviar && (
        <div className="border-b border-white/10 bg-amber-500/5 px-6 py-2 flex items-center gap-2 text-xs">
          <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-slate-400">Recebeu código por WhatsApp?</span>
          <button onClick={abrirModalCodigo}
            className="rounded bg-amber-500 px-3 py-1 font-bold text-slate-950 hover:bg-amber-400">
            Inserir código
          </button>
        </div>
      )}

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6 space-y-3 bg-slate-950">
        {mensagens.map(m => {
          const isMe   = isMaster ? m.autor_tipo === "agente" : m.autor_tipo === "cliente";
          const isSys  = m.autor_tipo === "sistema";
          if (isSys) {
            return (
              <div key={m.id} className="text-center text-[10px] text-slate-600">
                — {m.texto} ({formatHora(m.criado_em)}) —
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                m.interno ? "bg-amber-500/10 border border-amber-500/30 text-amber-200" :
                isMe      ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-100" :
                            "bg-slate-800 border border-white/10 text-slate-200"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                    {m.autor_nome}
                  </p>
                  {m.interno && (
                    <span className="text-[9px] flex items-center gap-1 text-amber-300">
                      <Lock className="h-2.5 w-2.5" /> nota interna
                    </span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.texto}</p>
                {Array.isArray(m.anexos) && m.anexos.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {m.anexos.map((a, ai) => (
                      a.mime?.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a key={ai} href={a.url} target="_blank" rel="noopener" className="block">
                          <img src={a.url} alt={a.nome}
                            className="max-w-xs rounded-lg border border-white/10 hover:border-white/30 transition cursor-pointer" />
                        </a>
                      ) : (
                        <a key={ai} href={a.url} target="_blank" rel="noopener"
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-2.5 py-1.5 hover:bg-white/5 text-xs">
                          <FileText className="h-4 w-4 text-blue-400" />
                          <span className="truncate flex-1">{a.nome}</span>
                          <span className="text-[10px] text-slate-500">{Math.round((a.tamanho || 0) / 1024)}KB</span>
                        </a>
                      )
                    ))}
                  </div>
                )}
                <p className="mt-1 text-[10px] opacity-50 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> {formatHora(m.criado_em)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      {podeEnviar ? (
        <div className="border-t border-white/10 bg-slate-900 p-3">
          {isMaster && (
            <label className="mb-2 flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400">
              <input type="checkbox" checked={interno} onChange={e => setInterno(e.target.checked)}
                className="h-3.5 w-3.5 accent-amber-500" />
              <Lock className="h-3 w-3" /> Nota interna (cliente não vê)
            </label>
          )}
          <div className="flex gap-2 items-end">
            {/* Botão de anexo */}
            <input ref={fileRef} type="file"
              accept="image/*,application/pdf,.txt,.zip,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) await uploadFile(f);
                if (fileRef.current) fileRef.current.value = "";
              }} />
            <button onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Anexar arquivo (ou cole imagem com Ctrl+V)"
              className="rounded-lg border border-white/10 bg-slate-950 p-2 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </button>

            <textarea
              value={texto} onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(); }}
              placeholder={interno
                ? "Nota interna (Ctrl+Enter envia)"
                : "Digite sua mensagem ou cole imagem (Ctrl+Enter envia)"}
              rows={2}
              className={`flex-1 resize-none rounded-lg border px-3 py-2 text-sm text-white focus:outline-none ${
                interno ? "border-amber-500/30 bg-amber-500/5" : "border-white/10 bg-slate-950"
              }`}
            />
            <button onClick={enviar} disabled={enviando || texto.trim().length < 1}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
                interno ? "bg-amber-500 hover:bg-amber-600 text-slate-950" : "bg-emerald-500 hover:bg-emerald-600"
              }`}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-white/10 bg-slate-950 p-4 text-center">
          <p className="text-xs text-slate-500">Chamado fechado. Abra um novo se precisar.</p>
        </div>
      )}

      {/* Modal: enviar email */}
      {modalEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalEmail(false); }}>
          <div className="w-full max-w-2xl rounded-2xl border border-blue-500/30 bg-slate-900 p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Mail className="h-5 w-5 text-blue-400" /> Enviar email
                </h3>
                <p className="text-xs text-slate-400">Email vai com seu nome+cargo+assinatura. Configure em /admin/usuarios</p>
              </div>
              <button onClick={() => setModalEmail(false)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Dropdown templates email */}
            {templates.filter(t => t.tipo === "email").length > 0 && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-400">Aplicar template</label>
                <select onChange={e => {
                  const t = templates.find(tp => tp.id === e.target.value);
                  if (t) aplicarTemplate(t, "email");
                  e.target.value = "";
                }}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="">— Nenhum —</option>
                  {templates.filter(t => t.tipo === "email").map(t => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>
            )}

            <label className="mb-1 block text-xs font-medium text-slate-400">Para</label>
            <input type="email" value={emailPara} onChange={e => setEmailPara(e.target.value)}
              placeholder="cliente@exemplo.com"
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />

            <label className="mb-1 block text-xs font-medium text-slate-400">Assunto</label>
            <input value={emailAss} onChange={e => setEmailAss(e.target.value)}
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />

            <label className="mb-1 block text-xs font-medium text-slate-400">Mensagem (HTML aceito)</label>
            <textarea value={emailHtml} onChange={e => setEmailHtml(e.target.value)} rows={8}
              placeholder="<p>Olá!</p>&#10;<p>Segue a resposta...</p>"
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white font-mono resize-none" />

            <div className="flex gap-2">
              <button onClick={() => setModalEmail(false)}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
                Cancelar
              </button>
              <button onClick={enviarEmail} disabled={enviandoEmail || !emailPara || !emailAss || emailHtml.length < 10}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50">
                {enviandoEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Enviar email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: WhatsApp */}
      {modalWA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalWA(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-green-500/30 bg-slate-900 p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-green-400" /> Disparar WhatsApp
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Usa template configurado em /admin/suporte/configuracoes se mensagem vazia.
                </p>
              </div>
              <button onClick={() => setModalWA(false)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Dropdown templates WhatsApp */}
            {templates.filter(t => t.tipo === "whatsapp").length > 0 && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-400">Aplicar template</label>
                <select onChange={e => {
                  const t = templates.find(tp => tp.id === e.target.value);
                  if (t) aplicarTemplate(t, "whatsapp");
                  e.target.value = "";
                }}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="">— Nenhum —</option>
                  {templates.filter(t => t.tipo === "whatsapp").map(t => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>
            )}

            <label className="mb-1 block text-xs font-medium text-slate-400">
              Telefone (vazio = pega do usuário do chamado)
            </label>
            <input type="tel" value={waTelefone} onChange={e => setWaTelefone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />

            <label className="mb-1 block text-xs font-medium text-slate-400">
              Mensagem custom (vazio = template configurado)
            </label>
            <textarea value={waMensagem} onChange={e => setWaMensagem(e.target.value)} rows={5}
              placeholder="Olá! Sobre seu chamado..."
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white resize-none" />

            <div className="flex gap-2">
              <button onClick={() => setModalWA(false)} disabled={enviandoWA}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
                Cancelar
              </button>
              <button onClick={enviarWhatsApp} disabled={enviandoWA}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-600 disabled:opacity-50">
                {enviandoWA ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: inserir código de validação */}
      {modalCodigo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalCodigo(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-900 p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-amber-400" /> Validação 2FA
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Cole o código de {modalCodigo.pendentes.length > 0 ? "verificação" : "validação"} recebido por WhatsApp.
                </p>
              </div>
              <button onClick={() => setModalCodigo(null)} className="text-slate-500 hover:text-white" title="Minimizar">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Pendentes válidos */}
            {modalCodigo.pendentes.length > 0 && (
              <div className="mb-4 space-y-2">
                {modalCodigo.pendentes.map(p => {
                  const expiraEm = new Date(p.expira_em).getTime();
                  const minutos = Math.max(0, Math.ceil((expiraEm - Date.now()) / 60000));
                  return (
                    <div key={p.tipo} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs flex items-center justify-between">
                      <span className="text-amber-200">
                        ⏱ {p.tipo === "admin" ? "Admin (6 dígitos)" : "Usuário (4 dígitos)"} — expira em {minutos} min
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Expirados */}
            {modalCodigo.expirados.length > 0 && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                ❌ Códigos expirados: {modalCodigo.expirados.map(e => e.tipo).join(", ")}
                <button onClick={() => reenviarCodigos(modalCodigo.expirados.length > 1 ? "ambos" : modalCodigo.expirados[0].tipo as "admin" | "usuario")}
                  disabled={reenviando}
                  className="ml-2 underline hover:text-red-100 disabled:opacity-50">
                  Reenviar
                </button>
              </div>
            )}

            {modalCodigo.pendentes.length > 0 && (
              <>
                <label className="mb-1 block text-xs font-medium text-slate-400">Tipo do código</label>
                <select value={codigoTipo} onChange={e => setCodigoTipo(e.target.value as "admin" | "usuario")}
                  className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  {modalCodigo.pendentes.map(p => (
                    <option key={p.tipo} value={p.tipo}>
                      {p.tipo === "admin" ? "Admin (6 dígitos)" : "Usuário (4 dígitos)"}
                    </option>
                  ))}
                </select>

                <label className="mb-1 block text-xs font-medium text-slate-400">Código</label>
                <input value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, ""))}
                  maxLength={6} placeholder="000000" autoFocus
                  onKeyDown={e => { if (e.key === "Enter" && codigo.length >= 4) confirmarCodigo(); }}
                  className="mb-4 w-full rounded-lg border border-amber-500/30 bg-slate-950 px-3 py-3 text-center text-2xl font-mono tracking-widest text-white focus:border-amber-500/60 focus:outline-none" />

                <div className="flex gap-2">
                  <button onClick={() => setModalCodigo(null)}
                    className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
                    Minimizar
                  </button>
                  <button onClick={() => reenviarCodigos(codigoTipo)} disabled={reenviando}
                    className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2.5 text-xs text-blue-300 hover:bg-blue-500/20 disabled:opacity-50">
                    {reenviando ? <Loader2 className="h-4 w-4 animate-spin" /> : "↻"}
                  </button>
                  <button onClick={confirmarCodigo} disabled={codigo.length < 4}
                    className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
                    Validar
                  </button>
                </div>
              </>
            )}

            {modalCodigo.pendentes.length === 0 && modalCodigo.expirados.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">
                Nenhum código pendente. Peça pro suporte solicitar validação.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal: solicitar validação 2FA */}
      {modalVal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalVal(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" /> Solicitar validação 2FA
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Sistema envia código(s) via WhatsApp pra confirmar autorização.
                </p>
              </div>
              <button onClick={() => setModalVal(false)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-2 text-xs font-medium text-slate-400">Quem deve validar?</p>
            <div className="space-y-1.5 mb-4">
              {[
                { v: "usuario", lbl: "Apenas usuário (selo amarelo, código 4 dígitos)" },
                { v: "admin",   lbl: "Apenas admin da empresa (selo azul, código 6 dígitos)" },
                { v: "ambos",   lbl: "Ambos (selo verde, dupla autenticação)" },
              ].map(o => (
                <label key={o.v} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${
                  valTipo === o.v ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10 hover:bg-white/5"
                }`}>
                  <input type="radio" name="vt" checked={valTipo === o.v}
                    onChange={() => setValTipo(o.v as "admin" | "usuario" | "ambos")}
                    className="h-4 w-4 accent-emerald-500" />
                  <span className="text-sm text-white">{o.lbl}</span>
                </label>
              ))}
            </div>

            <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-200">
              ℹ Pra usuário: usa <code>usuarios.telefone</code>.<br/>
              Pra admin: usa <code>empresas.whatsapp</code>.<br/>
              Se não cadastrado, falha na hora.
            </div>

            <div className="flex gap-2">
              <button onClick={() => setModalVal(false)}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
                Cancelar
              </button>
              <button onClick={solicitarValidacao} disabled={solicitandoVal}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
                {solicitandoVal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar códigos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
