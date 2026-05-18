"use client";

/**
 * /painel/empresa/contrato
 * Visualiza contrato vigente OU template + checkbox de aceite (clickwrap).
 * Quando aceito, oferece botão de imprimir/PDF (via window.print no documento estilizado).
 */
import { useEffect, useState, useCallback } from "react";
import { FileSignature, Check, Loader2, ShieldCheck, Printer, Download } from "lucide-react";
import { alertar } from "@/components/ui/ConfirmModal";
import { useSaasBranding } from "@/lib/hooks/useSaasBranding";

interface Aceito {
  id: string; versao: string; conteudo_html: string; conteudo_hash: string;
  aceito_em: string; aceito_por_nome: string; aceito_por_cpf: string | null; aceito_ip: string;
}

interface Template {
  id: string; versao: string; titulo: string; conteudo_html: string; conteudo_hash: string;
}

export default function ContratoPage() {
  const branding = useSaasBranding();
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

  function imprimir() {
    window.print();
  }

  if (status === "loading") return <div className="p-8 text-slate-400">Carregando contrato...</div>;

  const corPrimaria = (branding as unknown as { cor_primaria?: string }).cor_primaria ?? "#10b981";
  const conteudoHtml = aceito?.conteudo_html ?? template?.conteudo_html ?? "";

  return (
    <>
      {/* Print: só mostra a área do contrato, esconde resto */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          .contrato-imprimir, .contrato-imprimir * { visibility: visible !important; }
          .contrato-imprimir {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            background: white !important;
            color: #1a202c !important;
          }
          .no-print { display: none !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="space-y-6 max-w-4xl pb-12 no-print">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileSignature className="h-6 w-6 text-emerald-400" />
            <h1 className="text-2xl font-bold text-white">Contrato de prestação de serviços</h1>
          </div>
          {status === "aceito" && (
            <button onClick={imprimir}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20">
              <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
            </button>
          )}
        </div>

        {status === "aceito" && aceito && (
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
            <p className="mt-2 text-xs text-emerald-200/80">
              💡 Use o botão "Imprimir / Salvar PDF" acima pra baixar uma cópia formatada.
            </p>
          </div>
        )}

        {status === "pendente" && template && (
          <p className="text-sm text-slate-400">
            Versão <strong>{template.versao}</strong> · Leia com atenção e marque "Li e aceito" para concluir.
          </p>
        )}
      </div>

      {/* Documento bonito (printable) */}
      <div className="contrato-imprimir rounded-2xl border border-white/10 bg-white shadow-2xl max-w-4xl mx-auto"
           style={{ color: "#1a202c" }}>
        <DocumentoFormatado
          conteudo={conteudoHtml}
          corPrimaria={corPrimaria}
          branding={branding}
          aceito={aceito}
          maxHeight={status === "pendente" ? "60vh" : undefined}
        />
      </div>

      {status === "pendente" && template && (
        <div className="no-print max-w-4xl mx-auto mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
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
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-emerald-200 font-semibold">CPF (opcional)</label>
              <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00"
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <button onClick={aceitar} disabled={busy || !check || nome.length < 3}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Aceitar contrato eletronicamente
          </button>
        </div>
      )}
    </>
  );
}

interface BrandingShape {
  nome?: string;
  logo_url?: string | null;
  cor_primaria?: string | null;
  site?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  endereco?: string | null;
  cnpj?: string | null;
}

function DocumentoFormatado({ conteudo, corPrimaria, branding, aceito, maxHeight }: {
  conteudo: string;
  corPrimaria: string;
  branding: BrandingShape;
  aceito: Aceito | null;
  maxHeight?: string;
}) {
  return (
    <div style={{ maxHeight, overflowY: maxHeight ? "auto" : "visible" }}>
      {/* Header com logo */}
      <div style={{
        borderBottom: `4px solid ${corPrimaria}`,
        padding: "32px 48px 24px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        background: "linear-gradient(180deg, #fff 0%, #fafbfc 100%)",
      }}>
        {branding.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logo_url} alt={branding.nome ?? "Logo"}
            style={{ height: "56px", width: "auto", maxWidth: "200px", objectFit: "contain" }} />
        ) : (
          <div style={{
            height: "56px", width: "56px",
            background: corPrimaria, borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontWeight: "bold", fontSize: "24px",
          }}>{(branding.nome ?? "T")[0]}</div>
        )}
        <div>
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
            {branding.nome ?? "Three Digital"}
          </h1>
          {branding.site && (
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#64748b" }}>
              {branding.site.replace(/^https?:\/\//, "")}
            </p>
          )}
        </div>
      </div>

      {/* Conteúdo do contrato */}
      <article className="contrato-conteudo" style={{
        padding: "32px 48px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
        lineHeight: 1.7,
        fontSize: "14px",
        color: "#1e293b",
      }}>
        <style jsx>{`
          .contrato-conteudo :global(h1) {
            color: #0f172a; font-size: 22px; font-weight: bold;
            margin: 0 0 20px; padding-bottom: 12px;
            border-bottom: 2px solid ${corPrimaria};
            text-align: center;
          }
          .contrato-conteudo :global(h2) {
            color: ${corPrimaria}; font-size: 16px; font-weight: bold;
            margin: 28px 0 12px; text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .contrato-conteudo :global(h3) {
            color: #334155; font-size: 14px; font-weight: bold;
            margin: 20px 0 10px;
          }
          .contrato-conteudo :global(p)  {
            color: #334155; margin: 8px 0; text-align: justify;
          }
          .contrato-conteudo :global(ul) {
            color: #334155; margin: 8px 0 8px 20px; padding-left: 0;
          }
          .contrato-conteudo :global(li) { margin: 4px 0; }
          .contrato-conteudo :global(hr) {
            border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;
          }
          .contrato-conteudo :global(strong) { color: #0f172a; font-weight: 600; }
          .contrato-conteudo :global(blockquote) {
            color: #475569;
            border-left: 3px solid ${corPrimaria};
            padding: 8px 0 8px 16px; margin: 16px 0;
            background: #f8fafc;
          }
          .contrato-conteudo :global(em) { color: #64748b; }
        `}</style>
        <div dangerouslySetInnerHTML={{ __html: conteudo }} />
      </article>

      {/* Footer com selo de aceite (se aceito) */}
      {aceito && (
        <div style={{
          margin: "0 48px 32px",
          padding: "16px",
          borderRadius: "8px",
          border: `2px solid ${corPrimaria}`,
          background: `${corPrimaria}10`,
        }}>
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: corPrimaria, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            ✓ Aceite eletrônico registrado
          </p>
          <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#1e293b" }}>
            <strong>{aceito.aceito_por_nome}</strong>
            {aceito.aceito_por_cpf && ` (CPF: ${aceito.aceito_por_cpf})`}
            {" — "} {new Date(aceito.aceito_em).toLocaleString("pt-BR")}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#64748b", fontFamily: "monospace" }}>
            IP: {aceito.aceito_ip} · Versão {aceito.versao}<br />
            Hash SHA-256: {aceito.conteudo_hash}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: "10px", color: "#64748b", fontStyle: "italic" }}>
            Documento gerado eletronicamente. Validade jurídica garantida pela MP 2.200-2/2001.
          </p>
        </div>
      )}

      {/* Footer pequeno */}
      <div style={{
        borderTop: "1px solid #e2e8f0",
        padding: "16px 48px",
        fontSize: "10px",
        color: "#94a3b8",
        textAlign: "center",
      }}>
        {branding.nome ?? "Three Digital"}
        {branding.site && ` · ${branding.site.replace(/^https?:\/\//, "")}`}
        {branding.email && ` · ${branding.email}`}
      </div>
    </div>
  );
}
