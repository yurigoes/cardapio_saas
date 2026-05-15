"use client";

/**
 * /admin/suporte — Master gerencia acessos ao módulo Suporte das empresas.
 */
import { useEffect, useState } from "react";
import {
  ShieldCheck, Plus, Trash2, Copy, CheckCircle2, X, KeyRound, AlertTriangle,
  RefreshCw,
} from "lucide-react";

interface Acesso {
  id:               string;
  empresa_id:       string;
  empresa_nome:     string;
  chave_prefix:     string;
  duracao:          string;
  liberado_em:      string;
  expira_em:        string | null;
  personalizado:    boolean;
  revogado_em:      string | null;
  motivo_revogacao: string | null;
  ultimo_uso:       string | null;
  acessos_count:    number;
  status:           "ativo" | "expirado" | "revogado";
}

interface Empresa {
  id: string;
  nome_fantasia: string;
}

const DURACOES = [
  { v: "24h",    label: "24 horas",  desc: "Acesso pontual pra resolver algo" },
  { v: "30d",    label: "30 dias",   desc: "Acompanhamento de mudança recente" },
  { v: "90d",    label: "90 dias",   desc: "Trimestre de suporte estendido" },
  { v: "sempre", label: "Sempre",    desc: "Permanente — empresa pode trocar a chave" },
];

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function tempoAtras(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "agora";
  const s = Math.floor(ms / 1000); if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);    if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);    if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function tempoAte(iso: string | null): string {
  if (!iso) return "Sempre";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "Expirado";
  const m = Math.floor(ms / 60000);
  if (m < 60)    return `${m}min`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function AdminSuportePage() {
  const [acessos, setAcessos]   = useState<Acesso[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading]   = useState(true);

  // Modal criar
  const [modal,        setModal]        = useState(false);
  const [novaEmpresa,  setNovaEmpresa]  = useState<string>("");
  const [novaDuracao,  setNovaDuracao]  = useState<string>("24h");
  const [salvando,     setSalvando]     = useState(false);
  const [erro,         setErro]         = useState<string | null>(null);

  // Resultado: chave gerada
  const [chaveGerada, setChaveGerada] = useState<{ raw: string; empresa: string; duracao: string } | null>(null);
  const [copiado,     setCopiado]     = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/admin/suporte/acessos", { headers: authHeaders(), cache: "no-store" }),
        fetch("/api/admin/empresas?limit=500", { headers: authHeaders(), cache: "no-store" }),
      ]);
      const d1 = await r1.json(); const d2 = await r2.json();
      if (d1.success) setAcessos(d1.data.acessos ?? []);
      if (d2.success) {
        const lista = d2.data.empresas ?? d2.data ?? [];
        setEmpresas(lista.map((e: { id: string; nome_fantasia?: string; nome?: string }) => ({
          id: e.id, nome_fantasia: e.nome_fantasia ?? e.nome ?? "(sem nome)",
        })));
      }
    } catch {/* */}
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function criar() {
    if (!novaEmpresa) { setErro("Escolha uma empresa"); return; }
    setSalvando(true); setErro(null);
    try {
      const r = await fetch("/api/admin/suporte/acessos", {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ empresa_id: novaEmpresa, duracao: novaDuracao }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      const empNome = empresas.find(e => e.id === novaEmpresa)?.nome_fantasia ?? "Empresa";
      setChaveGerada({ raw: d.data.chave, empresa: empNome, duracao: novaDuracao });
      setModal(false);
      setNovaEmpresa(""); setNovaDuracao("24h");
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally { setSalvando(false); }
  }

  async function revogar(a: Acesso) {
    const motivo = prompt(`Motivo pra revogar acesso de "${a.empresa_nome}"? (opcional)`);
    if (motivo === null) return;
    try {
      await fetch(`/api/admin/suporte/acessos/${a.id}`, {
        method:  "DELETE",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ motivo }),
      });
      carregar();
    } catch {/* */}
  }

  function copy(t: string) {
    navigator.clipboard.writeText(t).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            Acessos ao Suporte
          </h1>
          <p className="text-xs text-slate-400">
            Libere o módulo de ajuda + tutoriais pra empresas específicas.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={carregar} disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button onClick={() => { setModal(true); setErro(null); }}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600">
            <Plus className="h-4 w-4" /> Novo acesso
          </button>
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-950 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Empresa</th>
              <th className="px-4 py-3 text-left">Chave</th>
              <th className="px-4 py-3 text-left">Duração</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Expira em</th>
              <th className="px-4 py-3 text-left">Último uso</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {acessos.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                {loading ? "Carregando..." : "Nenhum acesso liberado ainda"}
              </td></tr>
            ) : acessos.map(a => (
              <tr key={a.id} className="border-t border-white/5">
                <td className="px-4 py-3 text-white">{a.empresa_nome}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {a.chave_prefix}…
                  {a.personalizado && <span className="ml-2 text-[10px] text-amber-400">(personalizada)</span>}
                </td>
                <td className="px-4 py-3 text-slate-300 text-xs uppercase">{a.duracao}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    a.status === "ativo" ? "bg-emerald-500/15 text-emerald-400" :
                    a.status === "expirado" ? "bg-amber-500/15 text-amber-400" :
                    "bg-slate-500/15 text-slate-400"
                  }`}>{a.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{tempoAte(a.expira_em)}</td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {tempoAtras(a.ultimo_uso)}
                  {a.acessos_count > 0 && <span className="ml-1 text-[10px] text-slate-500">({a.acessos_count}x)</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {a.status === "ativo" && (
                    <button onClick={() => revogar(a)}
                      className="rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Revogar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal criar */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Liberar acesso ao Suporte</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Gera uma chave única que a empresa cola pra desbloquear o módulo.
                </p>
              </div>
              <button onClick={() => setModal(false)} className="rounded p-1 text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-1 block text-xs font-medium text-slate-400">Empresa</label>
            <select value={novaEmpresa} onChange={e => setNovaEmpresa(e.target.value)}
              className="mb-4 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
              <option value="">— Escolha —</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_fantasia}</option>)}
            </select>

            <label className="mb-1 block text-xs font-medium text-slate-400">Duração</label>
            <div className="mb-4 space-y-1.5">
              {DURACOES.map(d => (
                <label key={d.v}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                    novaDuracao === d.v ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10 hover:bg-white/5"
                  }`}>
                  <input type="radio" name="dur" checked={novaDuracao === d.v}
                    onChange={() => setNovaDuracao(d.v)} className="mt-1 h-4 w-4 accent-emerald-500" />
                  <div>
                    <p className="text-sm font-medium text-white">{d.label}</p>
                    <p className="text-[10px] text-slate-500">{d.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {erro && (
              <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-300">{erro}</div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setModal(false)} disabled={salvando}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">
                Cancelar
              </button>
              <button onClick={criar} disabled={salvando || !novaEmpresa}
                className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
                {salvando ? "Gerando..." : "Gerar chave"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: chave gerada */}
      {chaveGerada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border-2 border-amber-500/50 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <KeyRound className="h-8 w-8 text-amber-400 flex-shrink-0" />
              <div>
                <h3 className="text-base font-bold text-white">Chave gerada — {chaveGerada.empresa}</h3>
                <p className="mt-1 text-xs text-amber-300">
                  ⚠ Envie essa chave pra empresa AGORA. Ela <strong>não pode ser recuperada</strong> depois.
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-amber-500/30 bg-slate-950 p-3 font-mono text-xs text-amber-200 break-all">
              {chaveGerada.raw}
            </div>

            <button onClick={() => copy(chaveGerada.raw)}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400">
              {copiado ? <><CheckCircle2 className="h-4 w-4" /> Copiado!</> : <><Copy className="h-4 w-4" /> Copiar chave</>}
            </button>

            <div className="mb-4 rounded-lg bg-slate-950 p-3 text-xs">
              <p className="text-slate-400 mb-2">Mensagem sugerida pra enviar:</p>
              <pre className="text-slate-300 whitespace-pre-wrap">{`Olá! Liberei acesso ao módulo de Suporte da Three Digital pra ${chaveGerada.empresa}.

Chave de acesso (válida por ${chaveGerada.duracao === "sempre" ? "tempo indeterminado" : chaveGerada.duracao}):
${chaveGerada.raw}

Como usar:
1. Acesse seu painel
2. Vá em Suporte (no menu)
3. Cole a chave quando solicitado${chaveGerada.duracao === "sempre" ? "\n4. Depois você pode trocar por uma senha pessoal mais memorável" : ""}

Qualquer dúvida, fale conosco!`}</pre>
            </div>

            <button onClick={() => { setChaveGerada(null); setCopiado(false); }}
              className="w-full rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5">
              Já enviei, fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
