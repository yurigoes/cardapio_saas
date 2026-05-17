"use client";

/**
 * /painel/empresa/contrato
 * Visualiza contrato vigente OU template + checkbox de aceite (clickwrap).
 */
import { useEffect, useState, useCallback } from "react";
import { FileSignature, Check, Loader2, ShieldCheck } from "lucide-react";
import { alertar } from "@/components/ui/ConfirmModal";

interface Aceito {
  id: string; versao: string; conteudo_html: string; conteudo_hash: string;
  aceito_em: string; aceito_por_nome: string; aceito_por_cpf: string | null; aceito_ip: string;
}

interface Template {
  id: string; versao: string; titulo: string; conteudo_html: string; conteudo_hash: string;
}

export default function ContratoPage() {
  const [status, setStatus] = useState<"loading"|"pendente"|"aceito">("loading");
  const [template, setTemplate] = useState<Template | null>(null);
  const [aceito, setAceito] = useState<Aceito | null>(null);
  const [check, setCheck] = useState(false);
  const [nome, setNome] = useState("");
  const [cpf, setCpf]   = useState("");
  const [busy, setBusy] = useState(false);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    const r = await fetch("/api/painel/empresa/contrato", { headers: auth() }).then(r => r.json());
    if (!r.success) return;
    if (r.data.status === "aceito") {
      setAceito(r.data.contrato);
      setStatus("aceito");
    } else if (r.data.status === "pendente") {
      setTemplate(r.data.template);
      setStatus("pendente");
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function aceitar() {
    if (!check) { await alertar({ titulo: "Marque a confirmação", mensagem: "Você precisa marcar 'Li e aceito' para continuar.", tipo: "alerta" }); return; }
    if (nome.trim().length < 3) { await alertar({ titulo: "Nome obrigatório", tipo: "alerta" }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/painel/empresa/contrato", {
        method: "POST", headers: auth(),
        body: JSON.stringify({ aceito: true, nome_assinante: nome.trim(), cpf_assinante: cpf.trim() || undefined }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha");
      await alertar({ titulo: "Contrato aceito", mensagem: "Registro auditável criado.", tipo: "sucesso" });
      carregar();
    } catch (e) {
      await alertar({ titulo: "Falha", mensagem: (e as Error).message, tipo: "perigo" });
    } finally { setBusy(false); }
  }

  if (status === "loading") return <div className="p-8 text-slate-400">Carregando contrato...</div>;

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div className="flex items-center gap-3">
        <FileSignature className="h-6 w-6 text-emerald-400" />
        <h1 className="text-2xl font-bold text-white">Contrato de prestação de serviços</h1>
      </div>

      {status === "aceito" && aceito && (
        <>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="flex items-center gap-2 font-bold text-emerald-300">
              <ShieldCheck className="h-5 w-5" /> Contrato aceito
            </p>
            <p className="mt-2 text-xs text-emerald-200">
              Aceito em <strong>{new Date(aceito.aceito_em).toLocaleString("pt-BR")}</strong>
              {" por "} <strong>{aceito.aceito_por_nome}</strong>
              {aceito.aceito_por_cpf && ` (CPF ${aceito.aceito_por_cpf})`}
              {" · IP "} <code>{aceito.aceito_ip}</code>
            </p>
            <p className="mt-1 text-[11px] text-emerald-200/70">
              Versão {aceito.versao} · hash <code>{aceito.conteudo_hash.slice(0, 16)}…</code>
            </p>
          </div>
          <article className="prose prose-invert max-w-none rounded-2xl border border-white/10 bg-white/5 p-8">
            <div dangerouslySetInnerHTML={{ __html: aceito.conteudo_html }} />
          </article>
        </>
      )}

      {status === "pendente" && template && (
        <>
          <p className="text-sm text-slate-400">
            Versão <strong>{template.versao}</strong> · Leia com atenção e marque "Li e aceito" para concluir.
          </p>
          <article className="prose prose-invert max-w-none rounded-2xl border border-white/10 bg-white/5 p-8 max-h-[60vh] overflow-y-auto">
            <div dangerouslySetInnerHTML={{ __html: template.conteudo_html }} />
          </article>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
            <label className="flex items-start gap-3 text-sm text-emerald-100 cursor-pointer">
              <input type="checkbox" checked={check} onChange={e => setCheck(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-emerald-500/40 bg-white/5" />
              <span>
                <strong>Li, compreendi e aceito</strong> integralmente os termos do contrato acima.
                Reconheço que este aceite eletrônico tem o mesmo valor jurídico de assinatura
                manuscrita, conforme MP 2.200-2/2001.
              </span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-emerald-200 font-semibold">Seu nome completo</label>
                <input value={nome} onChange={e => setNome(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-emerald-200 font-semibold">CPF (opcional)</label>
                <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
              </div>
            </div>
            <button onClick={aceitar} disabled={busy || !check || nome.length < 3}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Aceitar contrato eletronicamente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
