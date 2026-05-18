"use client";

/**
 * /admin/financeiro/mensalidades — master vê todas mensalidades.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Receipt, RefreshCw, Loader2, Filter, Send, CheckCircle2, XCircle,
  ExternalLink, ArrowLeft, Plus, X, FileText, Upload, Trash2, FileCheck,
} from "lucide-react";
import Link from "next/link";
import { alertar, confirmar } from "@/components/ui/ConfirmModal";

interface Mensalidade {
  id:             string;
  empresa_id:     string;
  empresa_nome:   string;
  email:          string | null;
  mes_referencia: string;
  valor:          number;
  vencimento:     string;
  status:         "aberta" | "paga" | "atrasada" | "cancelada" | "isenta";
  pago_em:        string | null;
  pago_via:       string | null;
  mp_init_point:  string | null;
  plano_nome:     string | null;
  nota_fiscal_url:  string | null;
  nota_fiscal_nome: string | null;
  nota_fiscal_em:   string | null;
}

interface Totais {
  total_aberto:   string;
  total_paga:     string;
  total_atrasada: string;
  qtd_aberto:     string;
  qtd_paga:       string;
  qtd_atrasada:   string;
}

const STATUS_BADGE: Record<Mensalidade["status"], { label: string; cor: string }> = {
  aberta:    { label: "Aberta",    cor: "border-blue-500/30 bg-blue-500/10 text-blue-300" },
  paga:      { label: "Paga",      cor: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  atrasada:  { label: "Atrasada",  cor: "border-red-500/30 bg-red-500/10 text-red-300" },
  cancelada: { label: "Cancelada", cor: "border-slate-500/30 bg-slate-500/10 text-slate-300" },
  isenta:    { label: "Isenta",    cor: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
};

function authHeader(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

function fmtBRL(v: number | string) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function MensalidadesAdminPage() {
  const [list, setList]       = useState<Mensalidade[]>([]);
  const [totais, setTotais]   = useState<Totais | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus]   = useState("");
  const [mes, setMes]         = useState("");
  const [acaoBusy, setAcaoBusy] = useState<string | null>(null);
  const [novaMens, setNovaMens] = useState(false);
  const [novaAv, setNovaAv]     = useState(false);
  const [verAvulsas, setVerAvulsas] = useState(false);
  const [empresas, setEmpresas] = useState<Array<{ id: string; nome_fantasia: string }>>([]);
  const [uploadingNf, setUploadingNf] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileTargetRef = useRef<{ id: string; tipo: "mensalidade" | "avulsa" } | null>(null);

  function pedirArquivoNf(id: string, tipo: "mensalidade" | "avulsa" = "mensalidade") {
    fileTargetRef.current = { id, tipo };
    fileRef.current?.click();
  }

  async function uploadNf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !fileTargetRef.current) return;
    const { id, tipo } = fileTargetRef.current;
    setUploadingNf(id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/admin/mensalidades/${id}/nota-fiscal?tipo=${tipo}`, {
        method: "POST",
        headers: { Authorization: (authHeader() as Record<string, string>).Authorization },
        body: fd,
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha");
      await alertar({ titulo: "NF anexada", tipo: "sucesso" });
      carregar();
    } catch (err) {
      await alertar({ titulo: "Falha", mensagem: (err as Error).message, tipo: "perigo" });
    } finally {
      setUploadingNf(null);
      fileTargetRef.current = null;
    }
  }

  async function removerNf(id: string, tipo: "mensalidade" | "avulsa" = "mensalidade") {
    if (!await confirmar({ titulo: "Remover nota fiscal?", perigo: true })) return;
    setUploadingNf(id);
    try {
      await fetch(`/api/admin/mensalidades/${id}/nota-fiscal?tipo=${tipo}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      carregar();
    } finally {
      setUploadingNf(null);
    }
  }

  useEffect(() => {
    fetch("/api/admin/empresas?per_page=300", { headers: authHeader() })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const lista = d.data?.empresas ?? d.data ?? [];
          setEmpresas(lista.map((x: { id: string; nome_fantasia: string }) => ({ id: x.id, nome_fantasia: x.nome_fantasia })));
        }
      }).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (status) sp.set("status", status);
      if (mes)    sp.set("mes", mes);
      const r = await fetch(`/api/admin/mensalidades?${sp}`, { headers: authHeader() });
      const d = await r.json();
      if (d.success) {
        setList(d.data.mensalidades ?? []);
        setTotais(d.data.totais ?? null);
      }
    } finally { setLoading(false); }
  }, [status, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  async function acao(id: string, tipo: "reenviar_email" | "marcar_paga" | "cancelar") {
    if (tipo === "marcar_paga") {
      const ok = await confirmar({
        titulo: "Marcar como paga manualmente?",
        mensagem: "Use só se já recebeu o pagamento por outro meio.",
        okLabel: "Marcar paga", perigo: true,
      });
      if (!ok) return;
    }
    if (tipo === "cancelar") {
      const ok = await confirmar({
        titulo: "Cancelar fatura?",
        mensagem: "Marca como cancelada (não cobra mais).",
        okLabel: "Cancelar fatura", perigo: true,
      });
      if (!ok) return;
    }

    setAcaoBusy(`${id}-${tipo}`);
    try {
      const r = await fetch(`/api/admin/mensalidades/${id}/acoes`, {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ acao: tipo }),
      });
      const d = await r.json();
      if (d.success) {
        await alertar({ titulo: "Ação realizada", mensagem: d.data?.mensagem ?? "OK", tipo: "sucesso" });
        carregar();
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "?", tipo: "perigo" });
      }
    } finally { setAcaoBusy(null); }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Input invisível pra upload de NF */}
      <input ref={fileRef} type="file" className="hidden"
        accept="application/pdf,image/jpeg,image/png,application/xml,text/xml"
        onChange={uploadNf} />

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Receipt className="h-5 w-5 text-emerald-400" /> Mensalidades das empresas
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Faturas mensais geradas pela cron + cobrança via Mercado Pago
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setNovaMens(true)}
            className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-400">
            <Plus className="h-3.5 w-3.5" /> Nova mensalidade
          </button>
          <button onClick={() => setNovaAv(true)}
            className="flex items-center gap-1 rounded-xl bg-blue-500 px-3 py-2 text-xs font-bold text-white hover:bg-blue-400">
            <Plus className="h-3.5 w-3.5" /> Cobrança avulsa
          </button>
          <button onClick={() => setVerAvulsas(v => !v)}
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
            <FileText className="h-3.5 w-3.5" /> {verAvulsas ? "Ver mensalidades" : "Ver avulsas"}
          </button>
          <Link href="/admin/billing"
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
            <ArrowLeft className="h-3.5 w-3.5" /> Config MP
          </Link>
          <button onClick={carregar} disabled={loading}
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* Modais */}
      {novaMens && (
        <NovaMensModal empresas={empresas} onClose={() => setNovaMens(false)}
          onSuccess={() => { setNovaMens(false); carregar(); }} />
      )}
      {novaAv && (
        <NovaAvulsaModal empresas={empresas} onClose={() => setNovaAv(false)}
          onSuccess={() => { setNovaAv(false); }} />
      )}
      {verAvulsas && <AvulsasList />}

      {/* Cards totalizadores */}
      {totais && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
            <p className="text-xs uppercase tracking-wider text-blue-300">Em aberto</p>
            <p className="mt-2 text-2xl font-black text-white">{fmtBRL(totais.total_aberto)}</p>
            <p className="text-xs text-slate-500 mt-1">{totais.qtd_aberto} fatura(s)</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-xs uppercase tracking-wider text-emerald-300">Pago</p>
            <p className="mt-2 text-2xl font-black text-white">{fmtBRL(totais.total_paga)}</p>
            <p className="text-xs text-slate-500 mt-1">{totais.qtd_paga} fatura(s)</p>
          </div>
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-xs uppercase tracking-wider text-red-300">Atrasado</p>
            <p className="mt-2 text-2xl font-black text-white">{fmtBRL(totais.total_atrasada)}</p>
            <p className="text-xs text-slate-500 mt-1">{totais.qtd_atrasada} fatura(s)</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        <Filter className="h-4 w-4 text-slate-500" />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white">
          <option value="">Todos status</option>
          <option value="aberta">Aberta</option>
          <option value="paga">Paga</option>
          <option value="atrasada">Atrasada</option>
          <option value="cancelada">Cancelada</option>
          <option value="isenta">Isenta</option>
        </select>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white" />
        {(status || mes) && (
          <button onClick={() => { setStatus(""); setMes(""); }}
            className="text-xs text-slate-500 hover:text-white">Limpar</button>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading && list.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Nenhuma mensalidade nesse filtro</p>
        ) : (
          <div className="divide-y divide-white/5">
            {list.map(m => {
              const cfg = STATUS_BADGE[m.status];
              return (
                <div key={m.id} className="p-3 grid grid-cols-12 gap-2 text-xs items-center">
                  <div className="col-span-3 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{m.empresa_nome}</p>
                    {m.plano_nome && <p className="text-[10px] text-slate-500 truncate">{m.plano_nome}</p>}
                    {m.email && <p className="text-[10px] text-slate-500 truncate">{m.email}</p>}
                  </div>
                  <div className="col-span-2 text-slate-400">
                    <p>Ref: {fmtData(m.mes_referencia)}</p>
                    <p>Venc: {fmtData(m.vencimento)}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-base font-bold text-white">{fmtBRL(m.valor)}</p>
                    {m.pago_via && <p className="text-[10px] text-slate-500">via {m.pago_via}</p>}
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold ${cfg.cor}`}>
                      {cfg.label}
                    </span>
                    {m.pago_em && (
                      <p className="mt-1 text-[10px] text-emerald-400">↗ {fmtData(m.pago_em)}</p>
                    )}
                  </div>
                  <div className="col-span-3 flex justify-end gap-1 flex-wrap">
                    {m.mp_init_point && m.status !== "paga" && (
                      <a href={m.mp_init_point} target="_blank" rel="noopener"
                        title="Ver checkout" className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}

                    {/* Quando paga: Comprovante + Nota Fiscal */}
                    {m.status === "paga" && (
                      <>
                        <a href={`/comprovante/${m.id}?tipo=mensalidade`} target="_blank" rel="noopener"
                          title="Ver comprovante"
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-1.5 text-emerald-300 hover:bg-emerald-500/20">
                          <FileCheck className="h-3.5 w-3.5" />
                        </a>
                        {m.nota_fiscal_url ? (
                          <>
                            <a href={m.nota_fiscal_url} target="_blank" rel="noopener"
                              title={`NF: ${m.nota_fiscal_nome ?? "anexada"}`}
                              className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-1.5 text-blue-300 hover:bg-blue-500/20">
                              <FileText className="h-3.5 w-3.5" />
                            </a>
                            <button onClick={() => removerNf(m.id, "mensalidade")}
                              disabled={uploadingNf !== null}
                              title="Remover NF"
                              className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20 disabled:opacity-30">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => pedirArquivoNf(m.id, "mensalidade")}
                            disabled={uploadingNf !== null}
                            title="Anexar nota fiscal (PDF/JPG/PNG/XML)"
                            className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-1.5 text-amber-300 hover:bg-amber-500/20 disabled:opacity-30">
                            {uploadingNf === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </>
                    )}

                    {m.status !== "paga" && m.status !== "cancelada" && (
                      <>
                        <button onClick={() => acao(m.id, "reenviar_email")}
                          disabled={acaoBusy !== null} title="Reenviar email"
                          className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-blue-400 disabled:opacity-30">
                          {acaoBusy === `${m.id}-reenviar_email` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => acao(m.id, "marcar_paga")}
                          disabled={acaoBusy !== null} title="Marcar como paga"
                          className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-emerald-400 disabled:opacity-30">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => acao(m.id, "cancelar")}
                          disabled={acaoBusy !== null} title="Cancelar"
                          className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-red-400 disabled:opacity-30">
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modais e listagem de avulsas ─────────────────────────────────

function NovaMensModal({ empresas, onClose, onSuccess }: {
  empresas: Array<{ id: string; nome_fantasia: string }>;
  onClose: () => void; onSuccess: () => void;
}) {
  const hoje = new Date();
  const mesPad  = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}-01`;
  const vencPad = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}-10`;
  const [eid, setEid] = useState("");
  const [mes, setMes] = useState(mesPad);
  const [valor, setValor] = useState(0);
  const [venc, setVenc] = useState(vencPad);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  async function salvar() {
    if (!eid || valor <= 0) { await alertar({ titulo: "Empresa e valor obrigatórios", tipo: "alerta" }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/mensalidades", {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ empresa_id: eid, mes_referencia: mes, valor, vencimento: venc, observacoes: obs || undefined }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha");
      onSuccess();
    } catch (e) {
      await alertar({ titulo: "Falha", mensagem: (e as Error).message, tipo: "perigo" });
    } finally { setBusy(false); }
  }

  return (
    <ModalShell title="Nova mensalidade manual" onClose={onClose}>
      <Lbl t="Empresa"><Sel value={eid} onChange={setEid} opts={empresas} /></Lbl>
      <Lbl t="Mês ref (1º dia)"><input type="date" value={mes} onChange={e=>setMes(e.target.value)} className={INP} /></Lbl>
      <Lbl t="Valor (R$)"><input type="number" step="0.01" value={valor} onChange={e=>setValor(Number(e.target.value))} className={INP} /></Lbl>
      <Lbl t="Vencimento"><input type="date" value={venc} onChange={e=>setVenc(e.target.value)} className={INP} /></Lbl>
      <Lbl t="Observações"><input value={obs} onChange={e=>setObs(e.target.value)} className={INP} /></Lbl>
      <button onClick={salvar} disabled={busy}
        className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
        {busy ? "Criando..." : "Criar mensalidade"}
      </button>
    </ModalShell>
  );
}

function NovaAvulsaModal({ empresas, onClose, onSuccess }: {
  empresas: Array<{ id: string; nome_fantasia: string }>;
  onClose: () => void; onSuccess: () => void;
}) {
  const venc = new Date(Date.now() + 5*86400000).toISOString().slice(0,10);
  const [eid, setEid] = useState("");
  const [nome, setNome] = useState("");
  const [motivo, setMotivo] = useState("");
  const [valor, setValor] = useState(0);
  const [vencimento, setV] = useState(venc);
  const [busy, setBusy] = useState(false);

  async function salvar() {
    if (!eid || !nome || valor <= 0) { await alertar({ titulo: "Empresa, nome e valor obrigatórios", tipo: "alerta" }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/cobrancas-avulsas", {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ empresa_id: eid, nome, motivo: motivo || undefined, valor, vencimento }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha");
      await alertar({ titulo: "Cobrança criada", tipo: "sucesso" });
      onSuccess();
    } catch (e) {
      await alertar({ titulo: "Falha", mensagem: (e as Error).message, tipo: "perigo" });
    } finally { setBusy(false); }
  }

  return (
    <ModalShell title="Nova cobrança avulsa" onClose={onClose}>
      <Lbl t="Empresa"><Sel value={eid} onChange={setEid} opts={empresas} /></Lbl>
      <Lbl t="Nome da cobrança"><input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Ex: Setup inicial, Hora técnica" className={INP} /></Lbl>
      <Lbl t="Motivo / descrição"><textarea value={motivo} onChange={e=>setMotivo(e.target.value)} rows={3} className={INP} /></Lbl>
      <Lbl t="Valor (R$)"><input type="number" step="0.01" value={valor} onChange={e=>setValor(Number(e.target.value))} className={INP} /></Lbl>
      <Lbl t="Vencimento"><input type="date" value={vencimento} onChange={e=>setV(e.target.value)} className={INP} /></Lbl>
      <button onClick={salvar} disabled={busy}
        className="w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-400 disabled:opacity-40">
        {busy ? "Criando..." : "Criar cobrança"}
      </button>
    </ModalShell>
  );
}

function AvulsasList() {
  const [list, setList] = useState<Array<{
    id: string; empresa_nome: string; nome: string; motivo: string|null;
    valor: string; vencimento: string; status: string; origem: string;
    pago_via: string|null; nota_fiscal_url?: string|null; nota_fiscal_nome?: string|null;
  }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/cobrancas-avulsas", { headers: authHeader() }).then(r => r.json());
    if (r.success) setList(r.data ?? []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function marcarPaga(id: string) {
    const via = prompt("Forma de pagamento:", "pix");
    if (via === null) return;
    await fetch(`/api/admin/cobrancas-avulsas/${id}`, { method: "PATCH", headers: authHeader(), body: JSON.stringify({ status: "paga", pago_via: via }) });
    carregar();
  }
  async function cancelar(id: string) {
    if (!await confirmar({ titulo: "Cancelar cobrança?", perigo: true })) return;
    await fetch(`/api/admin/cobrancas-avulsas/${id}`, { method: "DELETE", headers: authHeader() });
    carregar();
  }
  function pedirNf(id: string) { targetRef.current = id; fileRef.current?.click(); }
  async function uploadNf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f || !targetRef.current) return;
    const id = targetRef.current;
    setBusy(id);
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch(`/api/admin/mensalidades/${id}/nota-fiscal?tipo=avulsa`, {
        method: "POST", headers: { Authorization: (authHeader() as Record<string, string>).Authorization }, body: fd,
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha");
      carregar();
    } catch (err) {
      await alertar({ titulo: "Falha", mensagem: (err as Error).message, tipo: "perigo" });
    } finally { setBusy(null); targetRef.current = null; }
  }
  async function removerNf(id: string) {
    if (!await confirmar({ titulo: "Remover NF?", perigo: true })) return;
    setBusy(id);
    try {
      await fetch(`/api/admin/mensalidades/${id}/nota-fiscal?tipo=avulsa`, { method: "DELETE", headers: authHeader() });
      carregar();
    } finally { setBusy(null); }
  }

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
      <input ref={fileRef} type="file" className="hidden"
        accept="application/pdf,image/jpeg,image/png,application/xml,text/xml"
        onChange={uploadNf} />
      <h3 className="mb-3 text-sm font-bold text-blue-300 uppercase tracking-wider">Cobranças avulsas ({list.length})</h3>
      {list.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-4">Nenhuma cobrança avulsa</p>
      ) : (
        <div className="divide-y divide-white/5">
          {list.map(c => (
            <div key={c.id} className="grid grid-cols-12 gap-2 p-2 text-xs items-center">
              <div className="col-span-3 min-w-0">
                <p className="text-sm font-bold text-white truncate">{c.empresa_nome}</p>
                <p className="text-[11px] text-slate-400 truncate">{c.nome}</p>
                {c.motivo && <p className="text-[10px] text-slate-600 truncate">{c.motivo}</p>}
              </div>
              <div className="col-span-2 text-right font-mono text-white">{fmtBRL(c.valor)}</div>
              <div className="col-span-2 text-slate-400">Vence: {fmtData(c.vencimento)}</div>
              <div className="col-span-2 text-center"><StatusPill status={c.status} /></div>
              <div className="col-span-3 flex justify-end gap-1 flex-wrap">
                {c.status === "aberta" && (
                  <>
                    <button onClick={() => marcarPaga(c.id)} title="Marcar paga"
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300 hover:bg-emerald-500/20">
                      <CheckCircle2 className="h-3 w-3" />
                    </button>
                    <button onClick={() => cancelar(c.id)} title="Cancelar"
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </>
                )}
                {c.status === "paga" && (
                  <>
                    <a href={`/comprovante/${c.id}?tipo=avulsa`} target="_blank" rel="noopener"
                      title="Comprovante"
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-1.5 text-emerald-300 hover:bg-emerald-500/20">
                      <FileCheck className="h-3.5 w-3.5" />
                    </a>
                    {c.nota_fiscal_url ? (
                      <>
                        <a href={c.nota_fiscal_url} target="_blank" rel="noopener"
                          title={`NF: ${c.nota_fiscal_nome ?? "anexada"}`}
                          className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-1.5 text-blue-300 hover:bg-blue-500/20">
                          <FileText className="h-3.5 w-3.5" />
                        </a>
                        <button onClick={() => removerNf(c.id)} disabled={busy !== null} title="Remover NF"
                          className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20 disabled:opacity-30">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => pedirNf(c.id)} disabled={busy !== null}
                        title="Anexar NF"
                        className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-1.5 text-amber-300 hover:bg-amber-500/20 disabled:opacity-30">
                        {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    aberta: "bg-blue-500/20 text-blue-300", paga: "bg-emerald-500/20 text-emerald-300",
    atrasada: "bg-red-500/20 text-red-300", cancelada: "bg-slate-500/20 text-slate-400",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${map[status] ?? "bg-white/10"}`}>{status}</span>;
}

const INP = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white";

function Lbl({ t, children }: { t: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">{t}</label>{children}</div>;
}

function Sel({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: Array<{ id: string; nome_fantasia: string }> }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white">
      <option value="">— escolher —</option>
      {opts.map(o => <option key={o.id} value={o.id}>{o.nome_fantasia}</option>)}
    </select>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h3 className="text-base font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
      </div>
    </div>
  );
}
