"use client";

/**
 * /painel/suporte — Centro de Ajuda + Suporte
 *
 * Fluxo:
 *  1. Carrega /api/painel/suporte/status
 *  2. Se !liberado → mostra "Acesso bloqueado, peça pro master liberar"
 *  3. Se liberado mas sem unlock localStorage → tela pra colar a chave
 *  4. Se desbloqueado → renderiza HelpContent
 *  5. Se duracao=sempre e !personalizado → mostra botão "Personalizar senha"
 */
import { useEffect, useState } from "react";
import { ShieldCheck, KeyRound, Lock, AlertTriangle, Pencil, X } from "lucide-react";
import { HelpContent } from "@/components/suporte/HelpContent";

const STORAGE_KEY = "suporte_unlocked";   // empresa_id+token short hash → "1"

interface Status {
  liberado:      boolean;
  master:        boolean;
  duracao:       string | null;
  expira_em:     string | null;
  personalizado: boolean;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function SuportePage() {
  const [status,    setStatus]    = useState<Status | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [unlocked,  setUnlocked]  = useState(false);
  const [chave,     setChave]     = useState("");
  const [enviando,  setEnviando]  = useState(false);
  const [erro,      setErro]      = useState<string | null>(null);
  const [podePersonalizar, setPodePersonalizar] = useState(false);

  // Modal personalizar
  const [modalPers, setModalPers] = useState(false);
  const [chavePers, setChavePers] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [salvandoPers, setSalvandoPers] = useState(false);

  useEffect(() => {
    fetch("/api/painel/suporte/status", { headers: authHeaders(), cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setStatus(d.data);
          // Master sempre desbloqueado direto
          if (d.data.master) setUnlocked(true);
          else if (d.data.liberado && localStorage.getItem(STORAGE_KEY) === "1") {
            setUnlocked(true);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function desbloquear() {
    if (chave.length < 8) { setErro("Cole a chave completa"); return; }
    setEnviando(true); setErro(null);
    try {
      const r = await fetch("/api/painel/suporte/desbloquear", {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ chave: chave.trim() }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Chave inválida");
      localStorage.setItem(STORAGE_KEY, "1");
      setUnlocked(true);
      setPodePersonalizar(!!d.data?.pode_personalizar);
      setChave("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally { setEnviando(false); }
  }

  async function personalizar() {
    if (chavePers.length < 8 || novaSenha.length < 8) {
      setErro("Ambos os campos precisam ter pelo menos 8 caracteres");
      return;
    }
    if (chavePers === novaSenha) { setErro("Senhas precisam ser diferentes"); return; }
    setSalvandoPers(true); setErro(null);
    try {
      const r = await fetch("/api/painel/suporte/personalizar", {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ chave_atual: chavePers.trim(), nova_senha: novaSenha.trim() }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      setModalPers(false);
      setChavePers(""); setNovaSenha("");
      setPodePersonalizar(false);
      alert("Senha personalizada com sucesso! Use a nova senha nas próximas vezes.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally { setSalvandoPers(false); }
  }

  function deslogarSuporte() {
    localStorage.removeItem(STORAGE_KEY);
    setUnlocked(false);
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  // Empresa sem acesso liberado pelo master
  if (!status?.liberado) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="rounded-2xl bg-amber-500/15 border border-amber-500/30 p-4 mb-4">
          <Lock className="h-12 w-12 text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Suporte indisponível</h1>
        <p className="text-sm text-slate-400 max-w-md">
          O acesso ao módulo de Suporte ainda não foi liberado pra esta empresa.
          Entre em contato com a Three Digital pra solicitar uma chave de acesso.
        </p>
        <p className="text-[11px] text-slate-600 mt-3">
          E-mail: digitalvendasthree@gmail.com
        </p>
      </div>
    );
  }

  // Liberado mas precisa colar chave
  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 p-6">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-lg bg-emerald-500/15 p-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Centro de Suporte</h1>
              <p className="text-xs text-slate-400">Cole a chave de acesso enviada pela Three Digital</p>
            </div>
          </div>

          <label className="mb-1 block text-xs font-medium text-slate-400">Chave de acesso</label>
          <div className="relative mb-3">
            <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="password"
              value={chave}
              onChange={e => setChave(e.target.value)}
              onKeyDown={e => e.key === "Enter" && desbloquear()}
              placeholder="sup_... (ou senha personalizada)"
              autoFocus
              className="w-full rounded-lg border border-white/10 bg-slate-950 pl-10 pr-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          {erro && (
            <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-300">{erro}</div>
          )}

          <button onClick={desbloquear} disabled={enviando || chave.length < 8}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
            {enviando ? "Validando..." : <><ShieldCheck className="h-4 w-4" /> Desbloquear</>}
          </button>

          <p className="mt-4 text-[10px] text-slate-600 text-center">
            Não tem a chave? Solicite ao administrador da Three Digital.
          </p>
        </div>
      </div>
    );
  }

  // Desbloqueado: renderiza ajuda
  return (
    <div className="space-y-4">
      {/* Header com info do acesso */}
      <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-emerald-300">
          <ShieldCheck className="h-4 w-4" />
          <span className="font-medium">
            {status.master ? "Acesso master" :
             status.duracao === "sempre" ? "Acesso permanente" :
             `Acesso por ${status.duracao}`}
          </span>
          {status.expira_em && (
            <span className="text-slate-500 ml-2">
              · expira {new Date(status.expira_em).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {(podePersonalizar || (status.duracao === "sempre" && !status.personalizado)) && (
            <button onClick={() => setModalPers(true)}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20">
              <Pencil className="h-3 w-3" /> Personalizar senha
            </button>
          )}
          {!status.master && (
            <button onClick={deslogarSuporte}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:bg-white/5">
              Bloquear novamente
            </button>
          )}
        </div>
      </div>

      <HelpContent />

      {/* Modal personalizar */}
      {modalPers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalPers(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-900 p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Personalizar senha</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Substitui a chave inicial por uma senha mais memorável.
                </p>
              </div>
              <button onClick={() => setModalPers(false)} className="rounded p-1 text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-1 block text-xs font-medium text-slate-400">Chave atual</label>
            <input type="password" value={chavePers} onChange={e => setChavePers(e.target.value)}
              placeholder="sup_... (a chave inicial)"
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm font-mono text-white" />

            <label className="mb-1 block text-xs font-medium text-slate-400">Nova senha</label>
            <input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />

            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200">
                Após salvar, a chave inicial deixa de funcionar. Use SÓ a nova senha nas próximas vezes.
              </p>
            </div>

            {erro && (
              <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-300">{erro}</div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setModalPers(false)} disabled={salvandoPers}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">
                Cancelar
              </button>
              <button onClick={personalizar} disabled={salvandoPers || chavePers.length < 8 || novaSenha.length < 8}
                className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
                {salvandoPers ? "Salvando..." : "Personalizar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
