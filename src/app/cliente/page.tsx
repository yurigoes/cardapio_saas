"use client";

/**
 * /cliente?empresa=<slug>
 *
 * Painel público do cliente final. Login via WhatsApp OTP (sem senha).
 * Mostra:
 *  - Pontos acumulados + cashback
 *  - Cupons disponíveis
 *  - Últimos pedidos
 */
import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Star, Gift, ShoppingBag, Phone, KeyRound, ArrowRight, Loader2,
  AlertCircle, LogOut, RefreshCw, ChefHat,
} from "lucide-react";

interface Cliente {
  id: string; nome: string | null; telefone: string | null; email: string | null;
  pontos: number; saldo_cashback: string;
  total_pedidos: number; total_gasto: string;
}

interface Empresa {
  id: string; slug: string; nome_fantasia: string; logo_url: string | null;
  cor_primaria: string | null; fidelidade_ativo: boolean;
  pontos_por_real: number; real_por_ponto: number;
  cashback_ativo: boolean; cashback_percentual: number;
}

interface Cupom {
  id: string; codigo: string; descricao: string | null;
  tipo_desconto: string; valor_desconto: number;
  valido_ate: string | null;
}

interface Pedido {
  id: string; numero: number; status: string; total: number;
  tipo_consumo: string | null; created_at: string;
}

const fmtBRL = (v: number | string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ClientePainel() {
  const sp = useSearchParams();
  const slug = sp?.get("empresa") ?? "";

  const [stage, setStage] = useState<"loading"|"entrar"|"codigo"|"dashboard">("loading");
  const [telefone, setTel] = useState("");
  const [cpf, setCpf]      = useState("");
  const [usarCpf, setUsarCpf] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<{
    cliente: Cliente; empresa: Empresa;
    cupons: Cupom[]; pedidos: Pedido[];
  } | null>(null);

  const carregarMe = useCallback(async () => {
    const token = localStorage.getItem(`cliente_token:${slug}`);
    if (!token) { setStage("entrar"); return; }
    try {
      const r = await fetch("/api/pub/cliente/me", {
        headers: { "x-cliente-token": token },
      });
      const d = await r.json();
      if (d.success) {
        setMe(d.data);
        setStage("dashboard");
      } else {
        localStorage.removeItem(`cliente_token:${slug}`);
        setStage("entrar");
      }
    } catch {
      setStage("entrar");
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) { setErro("Restaurante não especificado na URL"); setStage("entrar"); return; }
    carregarMe();
  }, [slug, carregarMe]);

  async function enviarCodigo() {
    setBusy(true); setErro(null);
    try {
      const r = await fetch("/api/pub/cliente/otp/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_slug: slug,
          ...(usarCpf ? { cpf } : { telefone }),
        }),
      });
      const d = await r.json();
      if (!d.success) { setErro(d.error ?? "Falha"); return; }
      setStage("codigo");
      // Em dev mostra o código
      if (d.data?._dev_codigo) {
        setErro(`[DEV] Código: ${d.data._dev_codigo}`);
      }
    } catch (e) { setErro((e as Error).message); }
    finally { setBusy(false); }
  }

  async function validarCodigo() {
    setBusy(true); setErro(null);
    try {
      const r = await fetch("/api/pub/cliente/otp/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_slug: slug, codigo,
          ...(usarCpf ? { cpf } : { telefone }),
        }),
      });
      const d = await r.json();
      if (!d.success) { setErro(d.error ?? "Código incorreto"); return; }
      localStorage.setItem(`cliente_token:${slug}`, d.data.token);
      await carregarMe();
    } catch (e) { setErro((e as Error).message); }
    finally { setBusy(false); }
  }

  function sair() {
    localStorage.removeItem(`cliente_token:${slug}`);
    setMe(null);
    setStage("entrar");
    setCodigo(""); setTel(""); setCpf("");
  }

  const cor = me?.empresa.cor_primaria ?? "#10b981";

  if (stage === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  // ── Login (entrar ou código) ──────────────────────────────
  if (stage !== "dashboard") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 space-y-4">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-3">
              <Star className="h-6 w-6 text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Meus pontos</h1>
            <p className="mt-1 text-sm text-slate-400">Acesso rápido com seu WhatsApp</p>
          </div>

          {stage === "entrar" && (
            <>
              <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
                <button onClick={() => setUsarCpf(false)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${!usarCpf ? "bg-emerald-500/20 text-emerald-300" : "text-slate-400"}`}>
                  Telefone
                </button>
                <button onClick={() => setUsarCpf(true)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${usarCpf ? "bg-emerald-500/20 text-emerald-300" : "text-slate-400"}`}>
                  CPF
                </button>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">
                  {usarCpf ? "Seu CPF" : "Seu WhatsApp"}
                </span>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type={usarCpf ? "text" : "tel"}
                    value={usarCpf ? cpf : telefone}
                    onChange={e => usarCpf ? setCpf(e.target.value) : setTel(e.target.value)}
                    placeholder={usarCpf ? "000.000.000-00" : "(11) 99999-9999"}
                    className="w-full rounded-xl border border-white/10 bg-slate-800 pl-10 pr-3 py-3 text-base text-white"
                  />
                </div>
              </label>

              <button onClick={enviarCodigo} disabled={busy || (usarCpf ? cpf.length < 11 : telefone.length < 10)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Enviar código no WhatsApp
              </button>
            </>
          )}

          {stage === "codigo" && (
            <>
              <p className="text-center text-sm text-slate-300">
                Enviamos um código de 6 dígitos no seu WhatsApp.
              </p>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">Código</span>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input type="text" inputMode="numeric" maxLength={6}
                    value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 pl-10 pr-3 py-3 text-base text-white font-mono tracking-widest text-center" />
                </div>
              </label>
              <button onClick={validarCodigo} disabled={busy || codigo.length !== 6}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                Entrar
              </button>
              <button onClick={() => { setStage("entrar"); setCodigo(""); setErro(null); }}
                className="w-full text-xs text-slate-400 hover:text-white">
                ← Trocar telefone/CPF
              </button>
            </>
          )}

          {erro && (
            <p className={`text-center text-xs ${erro.startsWith("[DEV]") ? "text-amber-400" : "text-red-300"}`}>
              {erro}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-white pb-12">
      <header className="border-b border-white/10 bg-slate-900/50 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {me?.empresa.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.empresa.logo_url} alt={me.empresa.nome_fantasia}
              className="h-10 w-auto max-w-[120px] object-contain" />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <ChefHat className="h-5 w-5 text-emerald-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{me?.empresa.nome_fantasia}</p>
            <h1 className="text-sm font-bold truncate">{me?.cliente.nome ?? "Cliente"}</h1>
          </div>
          <button onClick={sair} className="rounded-lg p-2 text-slate-400 hover:bg-white/5">
            <LogOut className="h-4 w-4" />
          </button>
          <button onClick={carregarMe} className="rounded-lg p-2 text-slate-400 hover:bg-white/5">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {/* Card pontos */}
        <div className="rounded-2xl p-6 text-white"
          style={{ background: `linear-gradient(135deg, ${cor} 0%, ${cor}aa 100%)` }}>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
            <Star className="h-4 w-4" /> Seus pontos
          </div>
          <p className="mt-2 text-4xl font-black">{me?.cliente.pontos.toLocaleString("pt-BR")}</p>
          {me?.empresa.fidelidade_ativo && me.empresa.real_por_ponto > 0 && (
            <p className="mt-1 text-xs opacity-90">
              Valem {fmtBRL((me.cliente.pontos / me.empresa.real_por_ponto) || 0)} em desconto
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Card label="Cashback" valor={fmtBRL(Number(me?.cliente.saldo_cashback ?? 0))} />
          <Card label="Pedidos"  valor={String(me?.cliente.total_pedidos ?? 0)} />
          <Card label="Gasto"    valor={fmtBRL(Number(me?.cliente.total_gasto ?? 0))} />
        </div>

        {/* Cupons */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
            <Gift className="h-4 w-4" /> Cupons disponíveis ({me?.cupons.length ?? 0})
          </h2>
          {(me?.cupons.length ?? 0) === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
              Nenhum cupom disponível agora
            </p>
          ) : (
            <div className="space-y-2">
              {me?.cupons.map(c => (
                <div key={c.id} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-bold text-emerald-300">{c.codigo}</p>
                      {c.descricao && <p className="text-xs text-slate-300 mt-0.5">{c.descricao}</p>}
                    </div>
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                      {c.tipo_desconto === "percentual"
                        ? `${c.valor_desconto}% OFF`
                        : fmtBRL(c.valor_desconto)}
                    </span>
                  </div>
                  {c.valido_ate && (
                    <p className="mt-1 text-[10px] text-slate-500">
                      Válido até {new Date(c.valido_ate).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Últimos pedidos */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
            <ShoppingBag className="h-4 w-4" /> Últimos pedidos
          </h2>
          {(me?.pedidos.length ?? 0) === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
              Nenhum pedido ainda
            </p>
          ) : (
            <div className="space-y-2">
              {me?.pedidos.map(p => (
                <a key={p.id} href={`/p/${p.id}`} target="_blank" rel="noopener"
                  className="block rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">#{p.numero}</p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")} · {p.tipo_consumo ?? "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">{fmtBRL(p.total)}</p>
                      <p className="text-[10px] text-slate-500 uppercase">{p.status}</p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Card({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-white">{valor}</p>
    </div>
  );
}

export default function ClientePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div>}>
      <ClientePainel />
    </Suspense>
  );
}
